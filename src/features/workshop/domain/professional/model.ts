import { z } from 'zod'
import { explanationReviewSchema } from '../explanationReview'
import { reportHistorySchema } from '../reportHistory'
import { faultIds } from './definitions'
import { canCompleteProfessional } from './assessment'
const hypothesisSchema = z
  .object({
    id: z.uuid(),
    fault: z.enum(faultIds),
    explanation: z.string().max(600),
    step: z.number().int().min(1).max(60).nullable(),
    conclusion: z.enum(['confirmed', 'refuted', 'inconclusive']),
    nextStep: z.string().max(600),
  })
  .strict()
export const professionalAttemptSchema = z
  .object({
    id: z.uuid(),
    storageToken: z.uuid().nullable().default(null),
    gradingVersion: z.union([z.literal(0), z.literal(2), z.literal(3)]).default(0),
    elapsedMinutes: z.number().int().min(0).max(600).default(0),
    selectedSnapshot: z.enum(['09:30', '10:02']).nullable().default(null),
    restoredSnapshot: z.enum(['09:30', '10:02']).nullable().default(null),
    hypothesisFaults: z.array(z.enum(faultIds)).max(7).default([]),
    hypotheses: z.array(hypothesisSchema).max(12).default([]),
    seed: z.number().int().min(0).max(4294967295).nullable().default(null),
    evidenceRefs: z.array(z.number().int().min(1).max(60)).max(60).default([]),
    caseId: z.enum(['unknown', 'portal', 'api', 'smb', 'recovery']),
    variant: z.number().int().min(0).max(3),
    at: z.iso.datetime(),
    updatedAt: z.iso.datetime().optional(),
    status: z.enum(['active', 'completed', 'abandoned']),
    revision: z.number().int().min(0).max(100),
    verifiedRevision: z.number().int().min(0).max(100).nullable(),
    remaining: z.array(z.enum(faultIds)).max(7),
    repaired: z.array(z.enum(faultIds)).max(7),
    observations: z.array(z.string().max(40)).max(30),
    steps: z
      .array(
        z
          .object({
            action: z.string().max(40),
            reason: z.string().max(600),
            result: z.string().max(600),
            outcome: z
              .enum([
                'observed',
                'changed',
                'rolled-back',
                'escalated',
                'verified',
                'escalation-verified',
                'rejected',
                'no-change',
                'failed-check',
              ])
              .optional(),
            violations: z
              .array(
                z.enum([
                  'unjustified-change',
                  'permission-required',
                  'snapshot-required',
                  'insufficient-evidence',
                ]),
              )
              .max(4)
              .optional(),
            revision: z.number().int().min(0).max(100),
            evidenceRefs: z.array(z.number().int().min(1).max(60)).max(10).default([]),
            findings: z
              .array(
                z.object({ fault: z.enum(faultIds), present: z.boolean().nullable() }).strict(),
              )
              .max(7)
              .default([]),
          })
          .strict(),
      )
      .max(60),
    report: z
      .object({
        symptom: z.string().max(1200),
        hypothesis: z.string().max(1200),
        evidence: z.string().max(1800),
        change: z.string().max(1200),
        verification: z.string().max(1200),
      })
      .strict(),
    reportLimits: z.string().max(1200).optional(),
    explanationReview: explanationReviewSchema.nullable().optional(),
    reportHistory: reportHistorySchema.optional(),
    reportVersion: z.number().int().min(1).max(10000).optional(),
    score: z.number().int().min(0).max(100).nullable(),
    escalated: z.boolean(),
    recoveryMinutes: z.number().min(0).max(1440).nullable(),
    lossMinutes: z.number().min(0).max(1440).nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      (a.caseId === 'unknown' && (a.seed === null || a.variant !== a.seed % 4)) ||
      (a.caseId !== 'unknown' && a.variant > 2)
    )
      ctx.addIssue({ code: 'custom', message: 'Вариант не соответствует сохранённому инциденту.' })
    if (
      new Set(a.hypotheses.map((h) => h.id)).size !== a.hypotheses.length ||
      a.hypotheses.some((h) => h.step !== null && !a.steps[h.step - 1])
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Гипотеза должна ссылаться на существующую проверку.',
      })
    if (
      new Set(a.remaining).size !== a.remaining.length ||
      new Set(a.repaired).size !== a.repaired.length ||
      a.remaining.some((f) => a.repaired.includes(f))
    )
      ctx.addIssue({ code: 'custom', message: 'Несогласованное состояние причин.' })
    // Version 0 completed reports remain historical evidence under their original rubric.
    if (a.gradingVersion === 3 && a.steps.some((step) => !step.outcome || !step.violations))
      ctx.addIssue({
        code: 'custom',
        message: 'Новая рубрика требует структурированного результата каждого действия.',
      })
    if (a.status === 'completed' && a.gradingVersion >= 2 && !canCompleteProfessional(a))
      ctx.addIssue({
        code: 'custom',
        message: 'Завершение требует доказательств, отчёта и проверки пользовательского сценария.',
      })
  })
export type ProfessionalAttempt = z.infer<typeof professionalAttemptSchema>
