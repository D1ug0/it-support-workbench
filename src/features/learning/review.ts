import { z } from 'zod'
import type { LearningProgress } from './progress'
import type { QuizQuestion } from './questions'

const time = z.string().datetime()
export const reviewSchema = z
  .object({
    reviewedAt: time,
    dueAt: time,
    streak: z.number().int().min(0).max(5),
  })
  .strict()
  .refine((value) => Date.parse(value.dueAt) >= Date.parse(value.reviewedAt))
export type Review = z.infer<typeof reviewSchema>
const intervals = [1, 3, 7, 14, 30] as const
const day = 86_400_000

export function scheduleReview(
  previous: Review | undefined,
  correct: boolean,
  now: number,
): Review {
  if (!Number.isFinite(now) || now < 0 || now > Date.UTC(9999, 10, 30))
    throw new Error('Некорректное время повторения.')
  // Repeating a known answer before its due date must not inflate the interval.
  if (correct && previous && previous.streak > 0 && now < Date.parse(previous.dueAt))
    return { ...previous }
  const streak = correct ? Math.min(5, (previous?.streak ?? 0) + 1) : 0
  return {
    reviewedAt: new Date(now).toISOString(),
    dueAt: new Date(now + (correct ? intervals[streak - 1]! * day : 600_000)).toISOString(),
    streak,
  }
}

export function buildReviewQueue(
  progress: LearningProgress,
  questions: readonly QuizQuestion[],
  now: number,
) {
  return questions
    .filter((question) => {
      if (!Object.hasOwn(progress.answers, question.id)) return false
      const review = progress.reviews[question.id]
      return !review || Date.parse(review.dueAt) <= now
    })
    .sort((a, b) => {
      const mistake =
        Number(progress.answers[a.id]!.lastCorrect) - Number(progress.answers[b.id]!.lastCorrect)
      return (
        mistake ||
        Date.parse(progress.reviews[a.id]?.dueAt ?? '1970-01-01T00:00:00Z') -
          Date.parse(progress.reviews[b.id]?.dueAt ?? '1970-01-01T00:00:00Z')
      )
    })
}
