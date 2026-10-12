import Dexie from 'dexie'
import type { Table } from 'dexie'
import { progressSchema } from './progress'
import type { LearningProgress } from './progress'
import {
  assertStorageBudget,
  learningTables,
  workshopDb,
} from '../../infrastructure/learning-storage/database'
const db = new Dexie('it-support-workbench-learning')
db.version(1).stores({ progress: 'id' })
export const legacyProgress: Table<
  { id: string; enabled: boolean; state: LearningProgress },
  string
> = db.table('progress')
export interface StoredLearning {
  id: string
  enabled: boolean
  state: LearningProgress | null
  revision: number
}
export const baseProgress: Table<StoredLearning, string> = workshopDb.table('baseProgress')
export async function readProgress() {
  let record = await baseProgress.get('progress')
  if (!record) {
    const previous = await legacyProgress.get('progress')
    if (previous) {
      const migrated = {
        id: 'progress',
        enabled: previous.enabled === true,
        state: progressSchema.parse(previous.state),
        revision: 1,
      }
      await workshopDb.transaction('rw', learningTables(), async () => {
        if (!(await baseProgress.get('progress'))) await baseProgress.put(migrated)
        await assertStorageBudget()
      })
      record = await baseProgress.get('progress')
    }
  }
  // Only remove the legacy copy after a validated replacement has been committed.
  const valid = record?.state
    ? {
        enabled: record.enabled === true,
        state: progressSchema.parse(record.state),
        revision: record.revision,
      }
    : undefined
  if (valid) {
    const previous = await legacyProgress.get('progress')
    const parsed = previous ? progressSchema.safeParse(previous.state) : undefined
    // A damaged or conflicting legacy copy remains available for explicit recovery export.
    if (parsed?.success && JSON.stringify(parsed.data) === JSON.stringify(valid.state))
      await legacyProgress.delete('progress')
  }
  return valid
}
export async function writeProgress(enabled: boolean, state: LearningProgress, expected?: number) {
  return workshopDb.transaction('rw', learningTables(), async () => {
    const current = await baseProgress.get('progress')
    if (expected !== undefined && (current?.revision ?? 0) !== expected)
      throw new Error('Учебный прогресс изменён в другой вкладке. Перечитайте сохранённую версию.')
    const revision = (current?.revision ?? 0) + 1
    await baseProgress.put({
      id: 'progress',
      enabled,
      state: progressSchema.parse(state),
      revision,
    })
    await assertStorageBudget()
    return revision
  })
}
export async function deleteProgress() {
  await baseProgress.delete('progress')
  await legacyProgress.clear()
}
