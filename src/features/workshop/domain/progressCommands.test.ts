import { describe, expect, it } from 'vitest'
import { emptyWorkshop, attemptSchema } from './skills'
import { applyLearningResult, appendTerminalResult, learningResultSchema } from './progressCommands'

const at = '2026-10-12T10:00:00Z'
const event = {
  attemptId: '11111111-1111-4111-8111-111111111111',
  module: 'course',
  taskId: 'DNS',
  skill: 'dns',
  at,
  score: 100,
  outcome: 'completed',
}

describe('progress commands without UI or storage', () => {
  it('updates the journal, theory and assessment together without mutating the input; replay is idempotent', () => {
    const progress = emptyWorkshop()
    const result = learningResultSchema.parse({
      event,
      theory: { taskId: 'DNS', skill: 'dns', form: 'choice', correct: true, at },
      assessment: true,
    })
    const next = applyLearningResult(progress, result)
    expect(progress.events).toEqual([])
    expect(progress.theoryChecks).toEqual([])
    expect(progress.assessment.dns).toBeUndefined()
    expect(next.events).toHaveLength(1)
    expect(next.theoryChecks).toHaveLength(1)
    expect(next.assessment.dns).toBe(true)
    expect(applyLearningResult(next, result)).toBe(next)
  })
  it('rejects a theory check from another task before updating progress', () => {
    expect(() =>
      learningResultSchema.parse({
        event,
        theory: { taskId: 'ADDRESS', skill: 'dns', form: 'choice', correct: true, at },
      }),
    ).toThrow('Проверка и событие должны принадлежать одному заданию.')
  })
  it('uses the supplied event identity and retains zero scores and failure evidence', () => {
    const progress = emptyWorkshop()
    const attempt = attemptSchema.parse({
      id: 'TERM-DNS-SERVER',
      skill: 'dns',
      mode: 'practice',
      score: 0,
      hints: 0,
      complete: false,
      at,
      seed: 1,
      errors: ['Проверка не выполнена'],
    })
    const next = appendTerminalResult(progress, attempt, event.attemptId)
    expect(next.events[0]).toMatchObject({
      attemptId: event.attemptId,
      score: 0,
      outcome: 'failed',
      errors: attempt.errors,
    })
    expect(progress.attempts).toEqual([])
  })
})
