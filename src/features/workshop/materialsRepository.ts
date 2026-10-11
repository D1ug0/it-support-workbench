import type { Table } from 'dexie'
import { workshopDb, learningTables, assertStorageBudget } from './storage'
import { putVersioned } from './versionedRecord'
import { customCourseSchema, validateCourseLinks } from './customCourses'
import { topologySchema } from '../terminal/networkModel'
import { labIds } from '../terminal/catalog'
import { loadCollection } from './collectionLoader'

export type MaterialCollection = 'labs' | 'courses' | 'graphs'
export type MaterialTokens = Record<string, string | null>
export type MaterialRecord<T> = { id: string; value: T; storageToken: string | null }
export function tokensFromRows(rows: readonly { id: string; storageToken?: string | null }[]) {
  return Object.fromEntries(rows.map((row) => [row.id, row.storageToken ?? null]))
}

// The token is local to the record envelope, so exported content stays portable.
export async function saveMaterials<T extends { id: string }>(
  collection: MaterialCollection,
  values: T[],
  expected: MaterialTokens,
) {
  if (
    !values.length ||
    values.length > 20 ||
    new Set(values.map((v) => v.id)).size !== values.length
  )
    throw new Error('Пакет должен содержать от 1 до 20 уникальных материалов.')
  if (collection === 'labs' && values.some((v) => !v.id.startsWith('USR-')))
    throw new Error('Встроенные задания не перезаписываются.')
  const table = workshopDb.table<MaterialRecord<T>, string>(collection)
  return workshopDb.transaction('rw', learningTables(), async () => {
    if (collection === 'courses') {
      const available = [
        ...labIds,
        ...loadCollection(
          'labs',
          await workshopDb.table('labs').toArray(),
          topologySchema,
          true,
        ).valid.map((lab) => lab.id),
      ]
      validateCourseLinks(
        values.map((v) => customCourseSchema.parse(v)),
        available,
      )
    }
    const keys = await table.toCollection().primaryKeys()
    if (new Set([...keys, ...values.map((v) => v.id)]).size > 20)
      throw new Error('Лимит: 20 собственных материалов в разделе.')
    const stored: MaterialRecord<T>[] = []
    for (const value of values)
      stored.push(
        await putVersioned(table, {
          id: value.id,
          value,
          storageToken: expected[value.id] ?? null,
        }),
      )
    await assertStorageBudget()
    return tokensFromRows(stored)
  })
}

export async function deleteMaterial(
  collection: MaterialCollection,
  id: string,
  expected: string | null,
) {
  const table: Table<MaterialRecord<unknown>, string> = workshopDb.table(collection)
  await workshopDb.transaction('rw', learningTables(), async () => {
    const row = await table.get(id)
    if ((row?.storageToken ?? null) !== expected)
      throw new Error(
        'Материал изменён в другой вкладке. Перечитайте сохранённую версию перед удалением.',
      )
    if (collection === 'labs') {
      const linked = (await workshopDb.table('courses').toArray()).some((record) => {
        const course = customCourseSchema.safeParse(record.value)
        return course.success && course.data.labs.includes(id)
      })
      if (linked)
        throw new Error(
          'Лаборатория используется авторским курсом. Сначала измените ссылки в курсе или удалите курс.',
        )
    }
    await table.delete(id)
  })
}
