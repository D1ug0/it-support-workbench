import {
  workshopDb,
  learningTables,
  assertStorageBudget,
} from '../../../infrastructure/learning-storage/database'
import { putVersioned } from './versionedRecord'
import { draftSchema, type LearningDraft } from '../domain/drafts'
export { draftSchema, type LearningDraft } from '../domain/drafts'
export const drafts = workshopDb.table<LearningDraft, string>('drafts')
export async function saveDraft(value: LearningDraft) {
  const valid = draftSchema.parse(value)
  return workshopDb.transaction('rw', learningTables(), async () => {
    if ((await drafts.count()) >= 50 && !(await drafts.get(valid.id)))
      throw new Error('Лимит: 50 учебных черновиков.')
    const saved = await putVersioned(drafts, valid)
    await assertStorageBudget()
    return saved
  })
}

export const readDrafts = () => drafts.toArray()
export const getDraft = (id: string) => drafts.get(id)
export async function deleteDraft(id: string) {
  await drafts.delete(id)
}
