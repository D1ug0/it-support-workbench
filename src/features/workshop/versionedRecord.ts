import type { Table } from 'dexie'
// Call inside a read/write transaction. A random token also detects deletion and backup restore.
export async function putVersioned<T extends { id: string; storageToken: string | null }>(
  table: Table<T, string>,
  value: T,
): Promise<T> {
  const existing = await table.get(value.id)
  if (
    (existing ? (existing.storageToken ?? null) : null) !== value.storageToken ||
    (!existing && value.storageToken !== null)
  )
    throw new Error(
      'Запись изменена в другой вкладке, удалена или восстановлена из копии. Ваши заметки остались в памяти: экспортируйте их, затем перечитайте сохранённую запись.',
    )
  const saved = { ...value, storageToken: globalThis.crypto.randomUUID() }
  await table.put(saved)
  return saved
}
