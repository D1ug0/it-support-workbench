import Dexie, { type Table } from 'dexie'
import type { Scenario } from './engine'
import { customScenarioSchema, mergeScenarios } from './custom'
const db = new Dexie('it-support-workbench-scenarios')
db.version(1).stores({ scenarios: 'id' })
const table: Table<Scenario, string> = db.table('scenarios')
export async function listScenarios() {
  return (await table.toArray()).map((s) => customScenarioSchema.parse(s))
}
export async function saveScenarios(values: Scenario[]) {
  // Parse before the transaction; reads, quota check and write commit atomically.
  const valid = values.map((s) => customScenarioSchema.parse(s))
  await db.transaction('rw', table, async () => {
    mergeScenarios(await table.toArray(), valid)
    await table.bulkPut(valid)
  })
}
export async function deleteScenario(id: string) {
  await table.delete(id)
}
