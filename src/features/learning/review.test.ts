import { describe, expect, it } from 'vitest'
import { buildReviewQueue, scheduleReview } from './review'
import { emptyProgress, parseProgress, progressSchema, recordAnswer } from './progress'
import { allLearningQuestions } from './catalog'
import { academyCourses, academyQuestions } from '../academy/catalog'
import { scenarios } from '../simulator/scenarios'
const now = Date.parse('2026-10-10T12:00:00Z')
const day = 86_400_000
const parse = (value: unknown) =>
  parseProgress(
    JSON.stringify(value),
    allLearningQuestions.map((q) => q.id),
    [...scenarios.map((s) => s.id), ...academyCourses.map((c) => `LAB-${c.id}`)],
  )
describe('review schedule and progress migration', () => {
  it('advances only on a due successful review and caps at thirty days', () => {
    let time = now
    let review = scheduleReview(undefined, true, time)
    expect(Date.parse(review.dueAt) - time).toBe(day)
    expect(scheduleReview(review, true, time + 1000)).toEqual(review)
    for (const interval of [3, 7, 14, 30, 30]) {
      time = Date.parse(review.dueAt)
      review = scheduleReview(review, true, time)
      expect(Date.parse(review.dueAt) - time).toBe(interval * day)
    }
    expect(review.streak).toBe(5)
    expect(
      progressSchema.safeParse({
        ...emptyProgress(),
        answers: { q: { attempts: 1, correct: 1, lastCorrect: true } },
        reviews: { q: review },
      }).success,
    ).toBe(true)
  })
  it('resets after a mistake and restarts at one day after correction', () => {
    const previous = scheduleReview(undefined, true, now)
    const wrong = scheduleReview(previous, false, now + 1000)
    expect(wrong.streak).toBe(0)
    expect(Date.parse(wrong.dueAt)).toBe(now + 601_000)
    expect(scheduleReview(wrong, true, now + 2000).streak).toBe(1)
    expect(previous.streak).toBe(1)
  })
  it('migrates v1 counters without inventing dates and keeps them due', () => {
    const id = allLearningQuestions[0]!.id
    const old = {
      schemaVersion: 1,
      answers: { [id]: { attempts: 4, correct: 3, lastCorrect: true } },
      scenarios: {},
    }
    const migrated = parse(old)
    expect(migrated).toEqual({ ...old, schemaVersion: 3, reviews: {}, journal: [], weeklyGoal: 10 })
    expect(buildReviewQueue(migrated, allLearningQuestions, now).map((q) => q.id)).toEqual([id])
    const updated = recordAnswer(migrated, id, true, now)
    expect(updated.answers[id]?.attempts).toBe(5)
    expect(parse(updated)).toEqual(updated)
  })
  it('queues only attempted due questions and prioritizes mistakes across both catalogs', () => {
    const first = allLearningQuestions[0]!,
      advanced = academyQuestions[0]!
    let state = recordAnswer(emptyProgress(), first.id, true, now - 2 * day)
    state = recordAnswer(state, advanced.id, false, now - 700_000)
    state = recordAnswer(state, allLearningQuestions[1]!.id, true, now)
    expect(buildReviewQueue(state, allLearningQuestions, now).map((q) => q.id)).toEqual([
      advanced.id,
      first.id,
    ])
    expect(parse(state)).toEqual(state)
    expect(buildReviewQueue(emptyProgress(), allLearningQuestions, now)).toEqual([])
  })
  it.each([NaN, Infinity, -1, 8.64e15])('rejects invalid scheduling time %s', (value) =>
    expect(() => scheduleReview(undefined, true, value)).toThrow(),
  )
  it('rejects orphan reviews, unknown IDs, reversed dates and extra fields', () => {
    const state = recordAnswer(emptyProgress(), allLearningQuestions[0]!.id, true, now)
    const id = allLearningQuestions[0]!.id
    for (const reviews of [
      { unknown: state.reviews[id] },
      { [id]: { ...state.reviews[id], dueAt: '2020-01-01T00:00:00Z' } },
      { [id]: { ...state.reviews[id], raw: 'PRIVATE' } },
      { [id]: { ...state.reviews[id], streak: 6 } },
    ])
      expect(() => parse({ ...state, reviews })).toThrow()
  })
})
