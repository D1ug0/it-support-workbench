import { z } from 'zod'
import { workshopDb, learningTables, assertStorageBudget } from './storage'
export const draftSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['investigation', 'stand']),
    attemptId: z.uuid(),
    taskId: z.string().max(80),
    at: z.iso.datetime(),
    notes: z
      .record(z.string().max(40), z.string().max(1800))
      .refine((v) => Object.keys(v).length <= 10),
  })
  .strict()
export type LearningDraft = z.infer<typeof draftSchema>
export const drafts = workshopDb.table<LearningDraft, string>('drafts')
export async function saveDraft(value: LearningDraft) {
  const valid = draftSchema.parse(value)
  await workshopDb.transaction('rw', learningTables(), async () => {
    if ((await drafts.count()) >= 50 && !(await drafts.get(valid.id)))
      throw new Error('Лимит: 50 учебных черновиков.')
    await drafts.put(valid)
    await assertStorageBudget()
  })
}
