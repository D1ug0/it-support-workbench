import Dexie from 'dexie'

// Learning and workshop share a database so a backup can be restored atomically.
export const workshopDb = new Dexie('it-support-workbench-workshop')
workshopDb.version(1).stores({ settings: 'id', labs: 'id', graphs: 'id', reports: 'id,at' })
workshopDb.version(2).stores({ courses: 'id' })
workshopDb.version(3).stores({ baseProgress: 'id', standAttempts: 'id' })

workshopDb
  .version(4)
  .stores({ scenarios: 'id', drafts: 'id', metadata: 'id', professionalAttempts: 'id,at' })
export const learningTableNames = [
  'settings',
  'labs',
  'graphs',
  'reports',
  'courses',
  'baseProgress',
  'standAttempts',
  'scenarios',
  'drafts',
  'metadata',
  'professionalAttempts',
] as const
export const learningTables = () => learningTableNames.map((name) => workshopDb.table(name))
// Reserve 4 MiB for the package envelope and legacy imports; writes use compact UTF-8 JSON.
export const storageBudget = 12 * 1024 * 1024
// Exactly the byte count of JSON.stringify(arrayOfTables), without retaining a second
// full copy of all records. Run inside the same transaction as the write.
export async function measureStorageTables(
  tables: readonly { each: (visit: (row: unknown) => void) => PromiseLike<unknown> }[],
  limit = storageBudget,
) {
  const encoder = new TextEncoder()
  let bytes = 2 + Math.max(0, tables.length - 1)
  function check() {
    if (bytes > limit)
      throw new Error(
        'Общий бюджет учебных данных: 12 MiB. Экспортируйте копию и удалите выбранные материалы перед сохранением.',
      )
  }
  for (const table of tables) {
    bytes += 2
    let first = true
    await table.each((row) => {
      bytes += encoder.encode(JSON.stringify(row) ?? 'null').length + (first ? 0 : 1)
      first = false
      check()
    })
    check()
  }
  check()
  return bytes
}
export async function assertStorageBudget() {
  await measureStorageTables(learningTables())
}
