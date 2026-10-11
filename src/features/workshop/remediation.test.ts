import { describe, expect, it } from 'vitest'
import { emptyWorkshop, learningEventSchema, workshopProgressSchema, skillStatus } from './skills'
import { learningErrorIds, type LearningErrorId } from './learningErrors'
import {
  beginRemediation,
  answerRemediation,
  remediationRecommendations,
  nextRemediation,
  remediationReviewDelay,
  eventErrorIds,
} from './remediation'
import { remediationChecks, remediationLessons } from './remediationCatalog'
import { remediationAttemptSchema } from './remediationSchema'
import { todayTask } from './learningFlow'
import { describeLearningEvent } from './learningHistory'
import { parseBackup } from './backup'
import { emptyProgress } from '../learning/progress'
const start = Date.parse('2026-10-11T10:00:00Z')
const id = '00000000-0000-4000-8000-000000000001'
function progress(errorId: LearningErrorId = 'dns-cache') {
  return {
    ...emptyWorkshop(),
    events: [
      learningEventSchema.parse({
        attemptId: id,
        module: 'course',
        taskId: 'DNS',
        skill: 'dns',
        at: new Date(start).toISOString(),
        score: 0,
        outcome: 'failed',
        errors: ['Прежнее объяснение сохраняется.'],
        errorIds: [errorId],
      }),
    ],
  }
}
function complete(p: ReturnType<typeof progress>, now: number, wrong = false) {
  const begun = beginRemediation(p, p.events[0]!.errorIds![0]!, now)
  const checks = remediationChecks(begun.attempt)
  const first = answerRemediation(
    begun.progress,
    begun.attempt.id,
    0,
    wrong ? (checks[0].correct + 1) % 3 : checks[0].correct,
    now + 1,
  )
  return answerRemediation(first.progress, begun.attempt.id, 1, checks[1].correct, now + 2)
}
describe('targeted DNS remediation', () => {
  it.each(learningErrorIds)(
    'closes %s only in new contexts, schedules a day later and leaves mastery unchanged',
    (errorId) => {
      const p = progress(errorId),
        baseline = skillStatus(p, 'dns', start)
      expect(todayTask(p, start).url).toContain(`error=${errorId}`)
      const done = complete(p, start)
      const due = start + 2 + remediationReviewDelay
      expect(nextRemediation(done.progress, due - 1)).toBeUndefined()
      expect(remediationRecommendations(done.progress, due - 1)[0]).toMatchObject({
        state: 'waiting',
        dueAt: due,
      })
      expect(() => beginRemediation(done.progress, errorId, due - 1)).toThrow('нет доступного')
      expect(remediationRecommendations(done.progress, due)[0]?.state).toBe('review')
      const review = beginRemediation(done.progress, errorId, due)
      expect(remediationChecks(review.attempt).map((q) => q.prompt)).not.toEqual(
        remediationChecks(done.attempt).map((q) => q.prompt),
      )
      const verified = complete(done.progress, due)
      expect(remediationRecommendations(verified.progress, due + 3)[0]?.state).toBe('verified')
      expect(nextRemediation(verified.progress, due + 3)).toBeUndefined()
      expect(verified.progress.events[0]).toEqual(p.events[0])
      expect(verified.progress.events).toHaveLength(3)
      expect(skillStatus(verified.progress, 'dns', due + 3)).toEqual(baseline)
      expect(describeLearningEvent(verified.progress.events[2]!).title).toContain(
        'проверка после перерыва',
      )
      expect(workshopProgressSchema.parse(verified.progress)).toEqual(verified.progress)
    },
  )
  it('fixes the first answer, rejects double clicks and records a failed attempt with the original error', () => {
    const p = progress(),
      begun = beginRemediation(p, 'dns-cache', start)
    const first = answerRemediation(begun.progress, begun.attempt.id, 0, 0, start + 1)
    expect(() => answerRemediation(first.progress, begun.attempt.id, 0, 1, start + 2)).toThrow(
      'зафиксирован',
    )
    const done = answerRemediation(first.progress, begun.attempt.id, 1, 2, start + 2)
    expect(done.progress.events.at(-1)).toMatchObject({
      score: 50,
      outcome: 'failed',
      errorIds: [],
    })
    expect(nextRemediation(done.progress, start + 3)?.state).toBe('practice')
    const retry = beginRemediation(done.progress, 'dns-cache', start + 3)
    expect(retry.attempt.variant).toBe(1)
    expect(remediationChecks(retry.attempt)[0].prompt).not.toBe(
      remediationChecks(begun.attempt)[0].prompt,
    )
    expect(done.attempt.answers[0]?.choice).toBe(0)
    expect(p.remediationAttempts).toHaveLength(0)
  })
  it('a failed delayed review reopens practice instead of confirming the error', () => {
    const practice = complete(progress(), start)
    const failed = complete(practice.progress, start + 2 + remediationReviewDelay, true)
    expect(
      remediationRecommendations(failed.progress, start + 4 + remediationReviewDelay)[0]?.state,
    ).toBe('practice')
    expect(failed.progress.events.at(-1)?.outcome).toBe('failed')
  })
  it('resumes partial answers across parsing and does not create a second active attempt', () => {
    const begun = beginRemediation(progress(), 'dns-cache', start)
    const first = answerRemediation(begun.progress, begun.attempt.id, 0, 1, start + 1)
    const restored = workshopProgressSchema.parse(JSON.parse(JSON.stringify(first.progress)))
    const resumed = beginRemediation(restored, 'dns-cache', start + 2)
    expect(resumed.attempt.id).toBe(begun.attempt.id)
    expect(resumed.attempt.answers).toEqual(first.attempt.answers)
    expect(resumed.progress.remediationAttempts).toHaveLength(1)
  })
  it('reads precise old task mappings but does not infer a diagnosis from arbitrary strings or unrelated failures', () => {
    const p = progress()
    delete p.events[0]!.errorIds
    expect(eventErrorIds(p.events[0]!)).toEqual(['dns-cache'])
    expect(eventErrorIds({ ...p.events[0]!, module: 'question', taskId: 'Q-2-2' })).toEqual([
      'dns-response',
    ])
    expect(eventErrorIds({ ...p.events[0]!, module: 'question', taskId: 'Q-2-3' })).toEqual([
      'dns-context',
    ])
    expect(
      eventErrorIds({
        ...p.events[0]!,
        module: 'terminal',
        taskId: 'TERM-DNS-CACHE',
        errors: ['DNS cache NXDOMAIN'],
      }),
    ).toEqual([])
    expect(eventErrorIds({ ...p.events[0]!, taskId: 'PACK-web-contradiction' })).toEqual([])
    expect(eventErrorIds({ ...p.events[0]!, outcome: 'completed' })).toEqual([])
    expect(eventErrorIds({ ...p.events[0]!, errorIds: [] })).toEqual([])
  })
  it('a newer source failure reopens an already resolved issue; unordered imports use dates', () => {
    const done = complete(progress(), start)
    const laterEvent = {
      ...done.progress.events[0]!,
      attemptId: crypto.randomUUID(),
      at: new Date(start + 10).toISOString(),
    }
    const p = { ...done.progress, events: [laterEvent, ...done.progress.events] }
    expect(nextRemediation(p, start + 11)?.source.attemptId).toBe(laterEvent.attemptId)
    expect(nextRemediation(p, start + 11)?.state).toBe('practice')
    expect(remediationRecommendations(p, start - 1)).toHaveLength(0)
    expect(nextRemediation(done.progress, start + 1)?.state).toBe('practice')
  })
  it('retains old text and round-trips sessions and scheduling in the existing backup envelope', () => {
    const old = emptyWorkshop()
    const legacy: Partial<typeof old> = { ...old }
    delete legacy.remediationAttempts
    expect(workshopProgressSchema.parse(legacy).remediationAttempts).toEqual([])
    const done = complete(progress(), start)
    const backup = parseBackup(
      JSON.stringify({
        format: 'it-workbench-learning-backup',
        schemaVersion: 2,
        createdAt: new Date(start).toISOString(),
        workshop: done.progress,
        learning: emptyProgress(),
        labs: [],
        graphs: [],
        courses: [],
        portfolio: [],
        standAttempts: [],
        scenarios: [],
        drafts: [],
        professionalAttempts: [],
      }),
    )
    expect(backup.workshop).toEqual(done.progress)
    expect(remediationRecommendations(backup.workshop, start + 3)[0]?.dueAt).toBe(
      start + 2 + remediationReviewDelay,
    )
  })
  it('rejects malformed, duplicated and premature imported sessions instead of silently granting verification', () => {
    const done = complete(progress(), start)
    expect(
      remediationAttemptSchema.safeParse({ ...done.attempt, completedAt: undefined }).success,
    ).toBe(false)
    expect(
      remediationAttemptSchema.safeParse({
        ...done.attempt,
        answers: [{ choice: 9, at: done.attempt.startedAt }],
      }).success,
    ).toBe(false)
    expect(
      remediationAttemptSchema.safeParse({
        ...done.attempt,
        answers: [{ choice: 1, at: new Date(start - 1).toISOString() }],
        completedAt: undefined,
      }).success,
    ).toBe(false)
    expect(
      workshopProgressSchema.safeParse({
        ...done.progress,
        remediationAttempts: [done.attempt, done.attempt],
      }).success,
    ).toBe(false)
    const review = {
      ...done.attempt,
      id: crypto.randomUUID(),
      phase: 'review',
      answers: [],
      completedAt: undefined,
      startedAt: new Date(start + 3).toISOString(),
    }
    expect(
      workshopProgressSchema.safeParse({
        ...done.progress,
        remediationAttempts: [done.attempt, review],
      }).success,
    ).toBe(false)
    expect(
      workshopProgressSchema.safeParse({
        ...done.progress,
        remediationAttempts: [
          { ...review, startedAt: new Date(start + 3 + remediationReviewDelay).toISOString() },
        ],
      }).success,
    ).toBe(false)
  })
  it('prioritizes active sessions and due reviews before a new issue', () => {
    const done = complete(progress(), start)
    const p = {
      ...done.progress,
      events: [
        ...done.progress.events,
        {
          ...done.progress.events[0]!,
          attemptId: crypto.randomUUID(),
          errorIds: ['dns-context' as const],
        },
      ],
    }
    const due = start + 2 + remediationReviewDelay
    expect(nextRemediation(p, due)?.lesson.id).toBe('dns-cache')
    const active = beginRemediation(p, 'dns-context', start + 3)
    expect(nextRemediation(active.progress, due)?.lesson.id).toBe('dns-context')
  })
  it('caps accumulated sessions explicitly without dropping previous errors or answers', () => {
    const p = progress()
    p.remediationAttempts = Array.from({ length: 100 }, () => ({
      ...complete(progress(), start, true).attempt,
      id: crypto.randomUUID(),
    }))
    expect(() => beginRemediation(p, 'dns-cache', start + 4)).toThrow('100')
    expect(p.remediationAttempts).toHaveLength(100)
  })
  it('all exercises have unambiguous choices and distinct delayed contexts', () => {
    for (const lesson of remediationLessons) {
      const practicePrompts = lesson.practice.flat().map((q) => q.prompt)
      for (const check of [...lesson.practice.flat(), ...lesson.review.flat()]) {
        expect(check.choices).toHaveLength(3)
        expect(new Set(check.choices).size).toBe(3)
        expect(check.correct).toBeGreaterThanOrEqual(0)
        expect(check.correct).toBeLessThan(3)
      }
      expect(lesson.review.flat().every((q) => !practicePrompts.includes(q.prompt))).toBe(true)
    }
  })
})
