import { z } from 'zod'
import { learningErrorIds, remediationReviewDelay } from './learningErrors'
import { remediationPassed } from './remediationCatalog'

export const remediationAttemptSchema = z
  .object({
    id: z.uuid(),
    errorId: z.enum(learningErrorIds),
    sourceAttemptId: z.uuid(),
    phase: z.enum(['practice', 'review']),
    contentVersion: z.literal(1),
    variant: z.number().int().min(0).max(1),
    startedAt: z.iso.datetime(),
    answers: z
      .array(z.object({ choice: z.number().int().min(0).max(2), at: z.iso.datetime() }).strict())
      .max(2),
    completedAt: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const times = [a.startedAt, ...a.answers.map((answer) => answer.at)]
    if (times.some((at, i) => i > 0 && Date.parse(at) < Date.parse(times[i - 1]!)))
      ctx.addIssue({ code: 'custom', message: 'Ответы должны следовать времени начала попытки.' })
    if (
      (a.answers.length === 2) !== !!a.completedAt ||
      (a.completedAt && a.completedAt !== a.answers[1]?.at)
    )
      ctx.addIssue({ code: 'custom', message: 'Завершение требует двух первых ответов и их даты.' })
  })
export type RemediationAttempt = z.infer<typeof remediationAttemptSchema>
export const remediationAttemptsSchema = z
  .array(remediationAttemptSchema)
  .max(100)
  .superRefine((attempts, ctx) => {
    if (new Set(attempts.map((a) => a.id)).size !== attempts.length)
      ctx.addIssue({ code: 'custom', message: 'ID коротких занятий не должны повторяться.' })
    const active = attempts
      .filter((a) => !a.completedAt)
      .map((a) => `${a.errorId}:${a.sourceAttemptId}`)
    if (new Set(active).size !== active.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Для одной исходной ошибки допустима одна активная попытка.',
      })
    for (const a of attempts.filter((a) => a.phase === 'review')) {
      const foundation = attempts
        .filter(
          (p) =>
            p.phase === 'practice' &&
            p.errorId === a.errorId &&
            p.sourceAttemptId === a.sourceAttemptId &&
            p.completedAt &&
            remediationPassed(p) &&
            Date.parse(p.completedAt) <= Date.parse(a.startedAt),
        )
        .sort((a, b) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!))
        .at(-1)
      if (
        !foundation ||
        Date.parse(a.startedAt) - Date.parse(foundation.completedAt!) < remediationReviewDelay
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Отложенная проверка требует успешного занятия и перерыва в сутки.',
        })
    }
  })
