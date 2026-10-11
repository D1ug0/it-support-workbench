import { z } from 'zod'
import { workshopDb, learningTables, assertStorageBudget } from './storage'
import { putVersioned } from './versionedRecord'
import { explanationReviewSchema } from './explanationReview'
import { reportEvidenceRefsSchema } from './portfolio'
export const draftSchema = z
  .object({
    id: z.uuid(),
    storageToken: z.uuid().nullable().default(null),
    kind: z.enum(['investigation', 'stand']),
    attemptId: z.uuid(),
    attemptFinished: z.boolean().default(false),
    taskId: z.string().max(80),
    title: z.string().min(1).max(160).optional(),
    at: z.iso.datetime(),
    notes: z
      .record(z.string().max(40), z.string().max(1800))
      .refine((v) => Object.keys(v).length <= 10),
    explanationReview: explanationReviewSchema.nullable().default(null),
    evidenceRefs: reportEvidenceRefsSchema,
    reportStatus: z.enum(['draft', 'completed']).default('draft'),
    score: z.number().int().min(0).max(100).nullable().default(null),
  })
  .strict()
export type LearningDraft = z.infer<typeof draftSchema>
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
