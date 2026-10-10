import { workshopDb as db } from './storage'
import { backupSchema, type LearningBackup } from './backup'
import { baseProgress, readProgress } from '../learning/repository'
import { emptyProgress } from '../learning/progress'
import { emptyWorkshop } from './skills'
import { standAttemptSchema, type StandAttempt } from './stand'
import type { Table } from 'dexie'
export const standAttempts: Table<StandAttempt, string> = db.table('standAttempts')
const names = ['settings', 'labs', 'courses', 'graphs', 'reports', 'baseProgress', 'standAttempts']
const tables = names.map((n) => db.table(n))
async function storedSnapshot() {
  const rows = await Promise.all(tables.map((t) => t.toArray()))
  // Stable token also covers unseen corrupt records and revisions, not only the visible UI.
  return JSON.stringify(
    rows.map((rows) => rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))),
  )
}
export async function backupToken() {
  await readProgress()
  return db.transaction('r', tables, storedSnapshot)
}
export async function readLearningBackup(): Promise<LearningBackup> {
  await readProgress()
  return db.transaction('r', tables, async () => {
    const learning = await baseProgress.get('progress'),
      workshop = await db.table('settings').get('progress')
    return backupSchema.parse({
      format: 'it-workbench-learning-backup',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
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
  await db.transaction('rw', tables, async () => {
    if ((await storedSnapshot()) !== token)
      throw new Error(
        'Данные изменились после предпросмотра. Заново откройте копию и проверьте замену.',
      )
    const previous = await db.table('settings').get('progress'),
      base = await baseProgress.get('progress')
    for (const name of ['labs', 'courses', 'graphs', 'reports', 'standAttempts'])
      await db.table(name).clear()
    await db.table('labs').bulkPut(valid.labs.map((value) => ({ id: value.id, value })))
    await db.table('courses').bulkPut(valid.courses.map((value) => ({ id: value.id, value })))
    await db.table('graphs').bulkPut(valid.graphs.map((value) => ({ id: value.id, value })))
    await db.table('reports').bulkPut(valid.portfolio)
    await standAttempts.bulkPut(valid.standAttempts)
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
  })
  try {
    localStorage.setItem('it-workbench-workshop-save', 'false')
  } catch {
    /* Persisted preference is also disabled. */
  }
}
export async function saveStandAttempt(value: StandAttempt) {
  const valid = standAttemptSchema.parse(value)
  await db.transaction('rw', standAttempts, async () => {
    if ((await standAttempts.count()) >= 50 && !(await standAttempts.get(valid.id)))
      throw new Error('Лимит: 50 отчётов стенда. Экспортируйте и удалите ненужные.')
    await standAttempts.put(valid)
  })
}
