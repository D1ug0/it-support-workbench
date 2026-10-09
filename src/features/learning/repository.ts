import Dexie from 'dexie'
import type { Table } from 'dexie'
import { progressSchema } from './progress'
import type { LearningProgress } from './progress'
const db = new Dexie('it-support-workbench-learning')
db.version(1).stores({ progress: 'id' })
const table: Table<{ id: string; enabled: boolean; state: LearningProgress }, string> =
  db.table('progress')
export async function readProgress() {
  const record = await table.get('progress')
  return record
    ? { enabled: record.enabled === true, state: progressSchema.parse(record.state) }
    : undefined
}
export async function writeProgress(enabled: boolean, state: LearningProgress) {
  await table.put({ id: 'progress', enabled, state: progressSchema.parse(state) })
}
export async function deleteProgress() {
  await table.clear()
}
