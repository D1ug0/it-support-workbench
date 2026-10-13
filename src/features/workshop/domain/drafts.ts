import { z } from 'zod'
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
