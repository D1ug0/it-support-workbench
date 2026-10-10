import { describe, it, expect } from 'vitest'
import { emptyProgress, recordAnswer, recordScenario, progressSchema } from './progress'
import { learningSummary } from './journal'
describe('learning journal and v3', () => {
  it('migrates v1 and v2 without inventing activity, preserving reviews', () => {
    const v2 = {
      schemaVersion: 2,
      answers: { q: { attempts: 1, correct: 1, lastCorrect: true } },
      scenarios: {},
      reviews: {
        q: { reviewedAt: '2026-10-01T12:00:00Z', dueAt: '2026-10-02T12:00:00Z', streak: 1 },
      },
    }
    expect(progressSchema.parse(v2)).toMatchObject({
      schemaVersion: 3,
      journal: [],
      weeklyGoal: 10,
      reviews: v2.reviews,
    })
  })
  it('caps events at 500 while retaining lifetime counters and avoiding input content', () => {
    let state = emptyProgress()
    for (let i = 0; i < 505; i++)
      state = recordAnswer(state, 'q', i % 2 === 0, Date.parse('2026-10-10T12:00:00Z') + i * 1000)
    state = recordScenario(state, 'PRACTICE-subnet-1', 100, Date.parse('2026-10-10T12:30:00Z'))
    expect(state.journal).toHaveLength(500)
    expect(state.answers.q?.attempts).toBe(505)
    expect(state.journal.at(-1)?.kind).toBe('practice')
    expect(Object.keys(state.journal[0]!)).toEqual(['taskId', 'kind', 'score', 'at'])
    expect(progressSchema.parse(state)).toEqual(state)
  })
  it('counts only the current local week and excludes future events', () => {
    const now = new Date(2026, 9, 10, 15).getTime()
    let state = recordAnswer(emptyProgress(), 'q', false, new Date(2026, 9, 5, 12).getTime())
    state = recordAnswer(state, 'q', true, new Date(2026, 9, 10, 12).getTime())
    state = recordAnswer(state, 'q', true, new Date(2026, 9, 11, 12).getTime())
    state = recordAnswer(state, 'q', true, new Date(2026, 9, 4, 12).getTime())
    expect(learningSummary(state, now)).toMatchObject({ completed: 2, success: 50, goal: 10 })
    expect(learningSummary(state, now).days.reduce((n, d) => n + d.count, 0)).toBe(2)
  })
  it('rejects orphan events, unknown fields, oversized journals and invalid goals', () => {
    const state = recordAnswer(emptyProgress(), 'q', true)
    for (const weeklyGoal of [0, 201, 1.5])
      expect(progressSchema.safeParse({ ...state, weeklyGoal }).success).toBe(false)
    expect(
      progressSchema.safeParse({ ...state, journal: [{ ...state.journal[0], taskId: 'unknown' }] })
        .success,
    ).toBe(false)
    expect(
      progressSchema.safeParse({ ...state, journal: [{ ...state.journal[0], answer: 'private' }] })
        .success,
    ).toBe(false)
    expect(
      progressSchema.safeParse({ ...state, journal: Array(501).fill(state.journal[0]) }).success,
    ).toBe(false)
  })
})
