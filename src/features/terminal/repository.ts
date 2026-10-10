import Dexie, { type Table } from 'dexie'
import { checkpointSchema, type Checkpoint } from './checkpoint'
import { terminalLabs, type LabId } from './catalog'
const db = new Dexie('it-support-workbench-terminal')
db.version(1).stores({ checkpoints: 'id' })
const table: Table<{ id: LabId; value: Checkpoint }, LabId> = db.table('checkpoints')
export async function saveCheckpoint(value: Checkpoint) {
  const valid = checkpointSchema.parse(value)
  await db.transaction('rw', table, async () => {
    if ((await table.count()) >= 50 && !(await table.get(valid.environment.labId)))
      throw new Error('Лимит: 50 контрольных точек. Удалите ненужные сохранения.')
    await table.put({ id: valid.environment.labId, value: valid })
  })
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

export async function listCheckpointSummaries() {
  return (await table.toArray()).map((row) => {
    const valid = checkpointSchema.safeParse(row.value)
    const network =
      valid.success && 'network' in valid.data.environment
        ? valid.data.environment.network
        : undefined
    return {
      id: row.id,
      title: valid.success
        ? (network?.definition.title ?? terminalLabs.find((l) => l.id === row.id)?.title ?? row.id)
        : `${row.id} · повреждённое сохранение`,
    }
  })
}
