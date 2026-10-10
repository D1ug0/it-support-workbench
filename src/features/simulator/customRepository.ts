import Dexie, { type Table } from 'dexie'
import type { Scenario } from './engine'
import { customScenarioSchema, mergeScenarios } from './custom'
import { workshopDb as db, learningTables, assertStorageBudget } from '../workshop/storage'
import { loadCollection } from '../workshop/collectionLoader'
const legacyDb = new Dexie('it-support-workbench-scenarios')
legacyDb.version(1).stores({ scenarios: 'id' })
export const legacyScenarios: Table<Scenario, string> = legacyDb.table('scenarios')
export const scenarioTable: Table<Scenario, string> = db.table('scenarios')
// Retain the source for recovery. A marker makes migration repeatable and stops resurrection after restore.
export async function migrateScenarios() {
  if (await db.table('metadata').get('scenario-migration')) return
  const source = await legacyScenarios.toArray()
  const loaded = loadCollection('legacyScenarios', source, customScenarioSchema)
  await db.transaction('rw', learningTables(), async () => {
    if (await db.table('metadata').get('scenario-migration')) return
    const existing = await scenarioTable.toArray()
    const conflicts = loaded.valid.filter((s) =>
      existing.some((v) => v.id === s.id && JSON.stringify(v) !== JSON.stringify(s)),
    )
    const incoming = loaded.valid.filter((s) => !existing.some((v) => v.id === s.id))
    mergeScenarios(
      loadCollection('scenarios', existing, customScenarioSchema).valid,
      incoming.length ? incoming : [],
    )
    await scenarioTable.bulkPut(incoming)
    // Corrupt and conflicting records remain in the old DB and are shown by the loader.
    if (!loaded.problems.length && !conflicts.length)
      await db.table('metadata').put({ id: 'scenario-migration', complete: true })
    await assertStorageBudget()
  })
}
export async function readScenarios() {
  let migrationError = ''
  try {
    await migrateScenarios()
  } catch (e) {
    migrationError = e instanceof Error ? e.message : 'Миграция не выполнена.'
  }
  const loaded = loadCollection('scenarios', await scenarioTable.toArray(), customScenarioSchema)
  const source = loadCollection(
    'legacyScenarios',
    await legacyScenarios.toArray(),
    customScenarioSchema,
  )
  const conflicts = source.valid.filter((s) =>
    loaded.valid.some((v) => v.id === s.id && JSON.stringify(v) !== JSON.stringify(s)),
  )
  return {
    valid: loaded.valid,
    problems: [
      ...(migrationError
        ? [{ collection: 'legacyScenarios', id: 'migration', reason: migrationError, raw: null }]
        : []),
      ...loaded.problems,
      ...source.problems,
      ...conflicts.map((raw) => ({
        collection: 'legacyScenarios',
        id: raw.id,
        reason: 'Конфликт ID: исходная версия сохранена отдельно.',
        raw,
      })),
    ],
  }
}
export async function listScenarios() {
  return (await readScenarios()).valid
}
export async function saveScenarios(values: Scenario[]) {
  await migrateScenarios()
  const valid = values.map((s) => customScenarioSchema.parse(s))
  await db.transaction('rw', learningTables(), async () => {
    mergeScenarios(
      loadCollection('scenarios', await scenarioTable.toArray(), customScenarioSchema).valid,
      valid,
    )
    if (
      new Set([...(await scenarioTable.toArray()).map((s) => s.id), ...valid.map((s) => s.id)])
        .size > 20
    )
      throw new Error('Лимит: 20 сценариев, включая проблемные записи.')
    await scenarioTable.bulkPut(valid)
    await assertStorageBudget()
  })
}
export async function deleteScenario(id: string) {
  await scenarioTable.delete(id)
  await legacyScenarios.delete(id)
}
