/** Versioned model criteria, separate from presentation and manual explanation review. */
export const learningPolicy = {
  version: 1,
  independentScore: 85,
  reviewAfterMs: 7 * 86_400_000,
  reviewWindowMs: 86_400_000,
} as const

export function isIndependentAttempt(attempt: {
  complete: boolean
  score: number
  hints: number
  mode: string
}) {
  return (
    attempt.complete &&
    attempt.score >= learningPolicy.independentScore &&
    attempt.hints === 0 &&
    attempt.mode !== 'guided'
  )
}
