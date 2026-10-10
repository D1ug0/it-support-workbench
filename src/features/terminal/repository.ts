import Dexie, { type Table } from 'dexie'
import { checkpointSchema, type Checkpoint } from './checkpoint'
import { type LabId } from './catalog'
const db = new Dexie('it-support-workbench-terminal')
db.version(1).stores({ checkpoints: 'id' })
const table: Table<{ id: LabId; value: Checkpoint }, LabId> = db.table('checkpoints')
export async function saveCheckpoint(value: Checkpoint) {
  const valid = checkpointSchema.parse(value)
  await table.put({ id: valid.environment.labId, value: valid })
}
export async function loadCheckpoint(id: LabId) {
  const value = await table.get(id)
  if (!value) return
  const valid = checkpointSchema.parse(value.value)
  if (valid.environment.labId !== id)
    throw new Error('Некорректный идентификатор контрольной точки.')
  return valid
}
export async function deleteCheckpoint(id: LabId) {
  await table.delete(id)
}
export async function countCheckpoints() {
  return table.count()
}
