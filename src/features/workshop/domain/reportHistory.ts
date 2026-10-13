import { z } from 'zod'
import {
  explanationReviewSchema,
  explanationContentKey,
  type ExplanationReport,
} from './explanationReview'

export const reportRevisionSchema = z
  .object({
    version: z.number().int().min(1).max(10000),
    at: z.iso.datetime(),
    contentKey: z.string().regex(/^[0-9a-f]{16}$/),
    report: z
      .object({
        symptom: z.string().max(1200),
        hypothesis: z.string().max(1200),
        evidence: z.string().max(1800),
        change: z.string().max(1200),
        verification: z.string().max(1200),
        limits: z.string().max(1200),
        evidenceRefs: z
          .array(
            z
              .object({
                commandId: z.number().int().min(1),
                recordId: z.uuid().optional(),
                revision: z.number().int().min(0),
                command: z.string().max(512),
                summary: z.string().max(300),
              })
              .strict(),
          )
          .max(40),
      })
      .strict(),
    review: explanationReviewSchema.nullable(),
  })
  .strict()
export const reportHistorySchema = z.array(reportRevisionSchema).max(3)
export type ReportRevision = z.infer<typeof reportRevisionSchema>

/** Keep three explicit prior saves, including feedback edits; no raw command output. */
export function appendReportRevision(
  history: ReportRevision[] | undefined,
  previous: {
    version: number
    at: string
    report: ExplanationReport
    review: ReportRevision['review']
  },
) {
  const report = Object.fromEntries(
    ['symptom', 'hypothesis', 'evidence', 'change', 'verification', 'limits', 'evidenceRefs'].map(
      (key) => [key, previous.report[key as keyof ExplanationReport]],
    ),
  )
  return [
    ...(history ?? []),
    reportRevisionSchema.parse({
      ...previous,
      report,
      contentKey: explanationContentKey(previous.report),
    }),
  ].slice(-3)
}
