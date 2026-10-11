import { describe, expect, it } from 'vitest'
import { describeLearningEvent, recentLearningEvents } from './learningHistory'
import { learningEventSchema, type LearningEvent } from './skills'
import { learningPackages, packageChecks } from './packages'

function event(module: LearningEvent['module'], taskId: string, at = '2026-10-11T10:00:00Z') {
  return learningEventSchema.parse({
    attemptId: '00000000-0000-4000-8000-000000000001',
    module,
    taskId,
    at,
    score: 0,
    outcome: 'failed',
    skill: 'dns',
  })
}
describe('readable learning history', () => {
  it.each([
    ['question', 'Q-1-1'],
    ['academy', 'ADV-TLS-1'],
    ['academy', 'LAB-tls'],
    ['practice', 'PRACTICE-subnet-1'],
    ['simulator', 'INC-DNS-001'],
    ['terminal', 'TERM-DNS-CACHE'],
    ['graph', 'GRAPH-00000000-0000-4000-8000-000000000001'],
    ['course', 'DNS'],
    ['professional', 'portal'],
    ['stand', 'dns'],
  ] as const)('finds the catalog title for %s/%s without exposing technical IDs', (module, id) => {
    const description = describeLearningEvent(event(module, id))
    expect(description.title).not.toBe('Задание из прежнего или недоступного материала')
    expect(description.title).not.toBe(id)
    expect(description.outcome).toBe('Нужна повторная попытка')
    expect(description.skill).toBe('DNS и кэш')
  })
  it('names current package questions and labels legacy events without inventing their old wording', () => {
    for (const packet of learningPackages) {
      for (const check of packageChecks(packet.id)) {
        for (const version of ['', 'v2-']) {
          expect(
            describeLearningEvent(event('course', `PACK-${packet.id}-${version}${check.id}`)).title,
          ).toBe(version ? check.prompt : `${packet.title} — задание прежней версии`)
        }
      }
    }
  })
  it('uses available author titles and keeps removed materials readable', () => {
    const id = 'USR-00000000-0000-4000-8000-000000000002'
    expect(
      describeLearningEvent(event('terminal', id), {
        labs: [{ id, title: 'Моя лаборатория DNS' }],
      }).title,
    ).toBe('Моя лаборатория DNS')
    expect(describeLearningEvent(event('terminal', id)).title).toBe(
      'Авторская терминальная лаборатория',
    )
    expect(describeLearningEvent(event('course', 'removed-course')).title).toBe(
      'Задание из прежнего или недоступного материала',
    )
    expect(
      describeLearningEvent({ ...event('stand', 'dns'), outcome: 'self-reported', score: null })
        .outcome,
    ).toBe('Самостоятельный отчёт')
  })
  it('shows the newest 30 imported events chronologically without changing stored order', () => {
    const events = Array.from({ length: 35 }, (_, i) =>
      event('course', 'DNS', new Date(i * 1000).toISOString()),
    )
    const original = [...events]
    const recent = recentLearningEvents(events)
    expect(recent).toHaveLength(30)
    expect(recent[0]!.at).toBe(events[34]!.at)
    expect(recent[29]!.at).toBe(events[5]!.at)
    expect(events).toEqual(original)
  })
})
