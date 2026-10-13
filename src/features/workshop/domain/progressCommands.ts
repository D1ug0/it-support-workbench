import { z } from 'zod'
import {
  attemptSchema,
  learningEventSchema,
  theoryCheckSchema,
  type WorkshopProgress,
} from './skills.ts'

export const learningResultSchema = z
  .object({
    event: learningEventSchema,
    theory: theoryCheckSchema.optional(),
    assessment: z.boolean().optional(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      result.theory &&
      (result.theory.taskId !== result.event.taskId ||
        result.theory.skill !== result.event.skill ||
        result.theory.at !== result.event.at)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Проверка и событие должны принадлежать одному заданию.',
      })
    if (result.assessment !== undefined && !result.event.skill)
      ctx.addIssue({ code: 'custom', message: 'Оценка требует явного навыка.' })
  })

export function applyLearningResult(
  progress: WorkshopProgress,
  result: z.infer<typeof learningResultSchema>,
): WorkshopProgress {
  const event = result.event
  if (progress.events.some((e) => e.attemptId === event.attemptId && e.module === event.module))
    return progress
  return {
    ...progress,
    events: [...progress.events, event].slice(-500),
    theoryChecks: result.theory
      ? [...progress.theoryChecks, result.theory].slice(-300)
      : progress.theoryChecks,
    assessment:
      result.assessment !== undefined && event.skill
        ? { ...progress.assessment, [event.skill]: result.assessment }
        : progress.assessment,
  }
}

export function appendTerminalResult(
  progress: WorkshopProgress,
  attempt: z.infer<typeof attemptSchema>,
  eventId: string,
): WorkshopProgress {
  const event = learningEventSchema.parse({
    attemptId: attempt.attemptId ?? eventId,
    module: 'terminal',
    taskId: attempt.id,
    skill: attempt.skill,
    at: attempt.at,
    score: attempt.score,
    outcome: attempt.complete ? 'completed' : 'failed',
    errors: attempt.errors ?? [],
  })
  return {
    ...progress,
    attempts: [...progress.attempts, attempt].slice(-500),
    events: [...progress.events, event].slice(-500),
  }
}
