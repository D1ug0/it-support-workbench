import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { LocalCase } from './schema'
import { caseSchema } from './schema'
const db = new Dexie('it-support-workbench-cases')
db.version(1).stores({ cases: 'id,createdAt,command' })
const table: Table<LocalCase, string> = db.table('cases')
export async function listCases() {
  return (await table.toArray()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
export async function renameCase(id: string, title: string) {
  await db.transaction('rw', table, async () => {
    const item = await table.get(id)
    if (!item) throw new Error('Кейс уже удалён.')
    await table.put(caseSchema.parse({ ...item, title: title.trim() }))
  })
}
export async function saveCase(value: LocalCase) {
  await importCases([value])
}
export async function importCases(values: LocalCase[]) {
  const valid = values.map((value) => caseSchema.parse(value))
  await db.transaction('rw', table, async () => {
    const current = await table.count()
    const existing = await table.bulkGet(valid.map((c) => c.id))
    const added = existing.filter((c) => !c).length
    if (current + added > 100)
      throw new Error('Лимит хранилища: 100 кейсов. Удалите ненужные кейсы.')
    await table.bulkPut(valid)
  })
}
export async function deleteCase(id: string) {
  await table.delete(id)
}
export async function deleteAllCases() {
  await table.clear()
}
