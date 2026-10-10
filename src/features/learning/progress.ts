import { z } from 'zod'
import { scheduleReview, reviewSchema } from './review'
import type { Review } from './review'
const count = z.number().int().min(0).max(1_000_000)
const legacyProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    answers: z
      .record(
        z.string().max(80),
        z
          .object({ attempts: count, correct: count, lastCorrect: z.boolean() })
          .strict()
          .refine((v) => v.attempts > 0 && v.correct <= v.attempts),
      )
      .refine((v) => Object.keys(v).length <= 1000),
    scenarios: z
      .record(
        z.string().max(80),
        z
          .object({ attempts: count, best: z.number().int().min(0).max(100) })
          .strict()
          .refine((v) => v.attempts > 0),
      )
      .refine((v) => Object.keys(v).length <= 1000),
  })
  .strict()
const currentProgressSchema = legacyProgressSchema
  .extend({
    schemaVersion: z.literal(2),
    reviews: z
      .record(z.string().max(80), reviewSchema)
      .refine((v) => Object.keys(v).length <= 1000),
  })
  .refine((v) => Object.keys(v.reviews).every((id) => Object.hasOwn(v.answers, id)))
export const progressSchema = z.union([
  currentProgressSchema,
  legacyProgressSchema.transform((value) => ({
    ...value,
    schemaVersion: 2 as const,
    reviews: {} as Record<string, Review>,
  })),
])
export type LearningProgress = z.infer<typeof progressSchema>
export const emptyProgress = (): LearningProgress => ({
  schemaVersion: 2,
  answers: {},
  scenarios: {},
  reviews: {},
})
export function recordAnswer(
  state: LearningProgress,
  id: string,
  correct: boolean,
  now = Date.now(),
): LearningProgress {
  const previous = state.answers[id]
  return {
    ...state,
    reviews: { ...state.reviews, [id]: scheduleReview(state.reviews[id], correct, now) },
    answers: {
      ...state.answers,
      [id]: {
        attempts: (previous?.attempts ?? 0) + 1,
        correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
        lastCorrect: correct,
      },
    },
  }
}
export function recordScenario(
  state: LearningProgress,
  id: string,
  score: number,
): LearningProgress {
  if (!Number.isInteger(score) || score < 0 || score > 100)
    throw new Error('Некорректная оценка сценария.')
  const previous = state.scenarios[id]
  return {
    ...state,
    scenarios: {
      ...state.scenarios,
      [id]: { attempts: (previous?.attempts ?? 0) + 1, best: Math.max(score, previous?.best ?? 0) },
    },
  }
}
export function parseProgress(
  text: string,
  questionIds: string[],
  scenarioIds: string[],
): LearningProgress {
  if (new TextEncoder().encode(text).length > 256 * 1024)
    throw new Error('Файл прогресса превышает 256 KiB.')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Некорректный JSON прогресса.')
  }
  const parsed = progressSchema.safeParse(value)
  if (
    !parsed.success ||
    Object.keys(parsed.data.answers).some((id) => !questionIds.includes(id)) ||
    Object.keys(parsed.data.scenarios).some((id) => !scenarioIds.includes(id))
  )
    throw new Error('Неподдерживаемый формат, версия или учебные идентификаторы.')
  return parsed.data
}
