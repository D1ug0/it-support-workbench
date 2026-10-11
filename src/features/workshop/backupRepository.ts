import { workshopDb as db, learningTables, assertStorageBudget } from './storage'
import { backupSchema, type LearningBackup } from './backup'
import { baseProgress, readProgress, legacyProgress } from '../learning/repository'
import { legacyScenarios, migrateScenarios } from '../simulator/customRepository'
import { emptyProgress } from '../learning/progress'
import { emptyWorkshop } from './skills'
import { standAttemptSchema, type StandAttempt } from './stand'
import type { Table } from 'dexie'
import { putVersioned } from './versionedRecord'
export const standAttempts: Table<StandAttempt, string> = db.table('standAttempts')
const tables = learningTables()
async function storedSnapshot() {
  const rows = await Promise.all(tables.map((t) => t.toArray()))
  // Stable token also covers unseen corrupt records and revisions, not only the visible UI.
  return JSON.stringify(
    rows.map((rows) => rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))),
  )
}
export async function backupToken() {
  // Recovery must work even when current or legacy progress cannot be parsed.
  await migrateScenarios().catch(() => {})
  const legacy = [await legacyProgress.toArray(), await legacyScenarios.toArray()]
  return JSON.stringify([await db.transaction('r', tables, storedSnapshot), legacy])
}
export async function readLearningBackup(): Promise<LearningBackup> {
  await readProgress()
  await migrateScenarios()
  return db.transaction('r', tables, async () => {
    const learning = await baseProgress.get('progress'),
      workshop = await db.table('settings').get('progress')
    return backupSchema.parse({
      format: 'it-workbench-learning-backup',
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      professionalAttempts: await db.table('professionalAttempts').toArray(),
      scenarios: await db.table('scenarios').toArray(),
      drafts: await db.table('drafts').toArray(),
      learning: learning?.state ?? emptyProgress(),
      workshop: workshop?.value ?? emptyWorkshop(),
      labs: (await db.table('labs').toArray()).map((r) => r.value),
      courses: (await db.table('courses').toArray()).map((r) => r.value),
      graphs: (await db.table('graphs').toArray()).map((r) => r.value),
      portfolio: await db.table('reports').toArray(),
      standAttempts: await standAttempts.toArray(),
    })
  })
}
export async function restoreLearningBackup(value: LearningBackup, token: string) {
  const valid = backupSchema.parse(value)
  const legacy = [await legacyProgress.toArray(), await legacyScenarios.toArray()]
  await db.transaction('rw', tables, async () => {
    if (JSON.stringify([await storedSnapshot(), legacy]) !== token)
      throw new Error(
        'Данные изменились после предпросмотра. Заново откройте копию и проверьте замену.',
      )
    const previous = await db.table('settings').get('progress'),
      base = await baseProgress.get('progress')
    for (const name of [
      'labs',
      'courses',
      'graphs',
      'reports',
      'standAttempts',
      ...(valid.schemaVersion === 2 ? ['scenarios', 'drafts', 'professionalAttempts'] : []),
    ])
      await db.table(name).clear()
    await db
      .table('labs')
      .bulkPut(
        valid.labs.map((value) => ({ id: value.id, value, storageToken: crypto.randomUUID() })),
      )
    await db
      .table('courses')
      .bulkPut(
        valid.courses.map((value) => ({ id: value.id, value, storageToken: crypto.randomUUID() })),
      )
    await db
      .table('graphs')
      .bulkPut(
        valid.graphs.map((value) => ({ id: value.id, value, storageToken: crypto.randomUUID() })),
      )
    await db
      .table('reports')
      .bulkPut(valid.portfolio.map((r) => ({ ...r, storageToken: globalThis.crypto.randomUUID() })))
    await standAttempts.bulkPut(
      valid.standAttempts.map((a) => ({ ...a, storageToken: crypto.randomUUID() })),
    )
    if (valid.schemaVersion === 2) {
      await db.table('professionalAttempts').bulkPut(
        (valid.professionalAttempts ?? []).map((a) => ({
          ...a,
          storageToken: crypto.randomUUID(),
        })),
      )
      await db.table('scenarios').bulkPut(valid.scenarios ?? [])
      await db
        .table('drafts')
        .bulkPut((valid.drafts ?? []).map((a) => ({ ...a, storageToken: crypto.randomUUID() })))
      await db.table('metadata').put({ id: 'scenario-migration', complete: true })
    }
    await baseProgress.put({
      id: 'progress',
      state: valid.learning,
      enabled: false,
      revision: (base?.revision ?? 0) + 1,
    })
    await db.table('settings').put({
      id: 'progress',
      value: valid.workshop,
      enabled: false,
      revision: (previous?.revision ?? 0) + 1,
    })
    await assertStorageBudget()
  })
  try {
    localStorage.setItem('it-workbench-workshop-save', 'false')
  } catch {
    /* Persisted preference is also disabled. */
  }
}
export async function saveStandAttempt(value: StandAttempt) {
  const valid = standAttemptSchema.parse(value)
  return db.transaction('rw', tables, async () => {
    if ((await standAttempts.count()) >= 50 && !(await standAttempts.get(valid.id)))
      throw new Error('Лимит: 50 отчётов стенда. Экспортируйте и удалите ненужные.')
    const saved = await putVersioned(standAttempts, valid)
    await assertStorageBudget()
    return saved
  })
}

export async function recoverySnapshot() {
  return {
    format: 'it-workbench-recovery-raw',
    at: new Date().toISOString(),
    records: await db.transaction('r', tables, async () =>
      Object.fromEntries(await Promise.all(tables.map(async (t) => [t.name, await t.toArray()]))),
    ),
    legacyProgress: await legacyProgress.toArray(),
    legacyScenarios: await legacyScenarios.toArray(),
  }
}
