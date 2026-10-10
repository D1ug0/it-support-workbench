import Dexie, { type Table } from 'dexie'
import { archiveSchema, mergeArchives, type SessionArchive } from './archive'
const db = new Dexie('it-support-workbench-sessions')
db.version(1).stores({ archives: 'id,savedAt' })
const table: Table<SessionArchive, string> = db.table('archives')
export async function listArchives() {
  return (await table.toArray())
    .map((a) => archiveSchema.parse(a))
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
}
export async function saveArchive(value: SessionArchive) {
  const valid = archiveSchema.parse(value)
  await db.transaction('rw', table, async () => {
    mergeArchives(await table.toArray(), valid)
    await table.put(valid)
  })
}
export async function deleteArchive(id: string) {
  await table.delete(id)
}
