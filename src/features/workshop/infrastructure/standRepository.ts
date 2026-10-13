import {
  workshopDb as db,
  learningTables,
  assertStorageBudget,
} from '../../../infrastructure/learning-storage/database'
import { standAttemptSchema, type StandAttempt } from '../domain/stand'
import { putVersioned } from './versionedRecord'
export const standAttempts = db.table<StandAttempt, string>('standAttempts')
const tables = learningTables()
export async function saveStandAttempt(value: StandAttempt) {
  const valid = standAttemptSchema.parse(value)
  return db.transaction('rw', tables, async () => {
    if ((await standAttempts.count()) >= 50 && !(await standAttempts.get(valid.id)))
      throw new Error('Лимит: 50 отчётов стенда. Экспортируйте и удалите ненужные.')
    const saved = await putVersioned(standAttempts, valid)
    await assertStorageBudget()
    return saved
  })
}

export const readStandAttempts = () => standAttempts.toArray()
export const getStandAttempt = (id: string) => standAttempts.get(id)
export const countStandAttempts = () => standAttempts.count()
export async function deleteStandAttempt(id: string) {
  await standAttempts.delete(id)
}
