import { describe, it, expect } from 'vitest'
import { emptyProgress, recordAnswer, recordScenario, parseProgress } from './progress'
import { questions } from './questions'
import { scenarios } from '../simulator/scenarios'
import { playbooks, exportChecklist } from '../playbooks/catalog'
const parse = (text: string) =>
  parseProgress(
    text,
    questions.map((q) => q.id),
    scenarios.map((s) => s.id),
  )
describe('learning without diagnostic data', () => {
  it('tracks attempts and latest understanding without mutating previous state', () => {
    const initial = emptyProgress()
    let state = recordAnswer(initial, questions[0]!.id, false)
    state = recordAnswer(state, questions[0]!.id, true)
    expect(state.answers[questions[0]!.id]).toEqual({ attempts: 2, correct: 1, lastCorrect: true })
    expect(initial).toEqual(emptyProgress())
    state = recordScenario(state, scenarios[0]!.id, 100)
    state = recordScenario(state, scenarios[0]!.id, 70)
    expect(state.scenarios[scenarios[0]!.id]).toEqual({ attempts: 2, best: 100 })
    expect(parse(JSON.stringify(state))).toEqual(state)
  })
  it.each([-1, 101, 0.5, Number.NaN])('rejects invalid scenario score %j', (score) =>
    expect(() => recordScenario(emptyProgress(), 'demo', score)).toThrow(),
  )
  it('validates imports including versions, IDs, bounds and size', () => {
    for (const text of [
      'bad',
      '{"schemaVersion":99}',
      '{"schemaVersion":1,"answers":{"unknown":{"attempts":1,"correct":1,"lastCorrect":true}},"scenarios":{}}',
      JSON.stringify({
        ...emptyProgress(),
        answers: { [questions[0]!.id]: { attempts: 1, correct: 2, lastCorrect: true } },
      }),
    ])
      expect(() => parse(text)).toThrow()
    expect(() => parse('a'.repeat(256 * 1024 + 1))).toThrow('256 KiB')
  })
  it('keeps all questions and playbooks valid, sourced and distinct', () => {
    expect(questions).toHaveLength(30)
    expect(new Set(questions.map((q) => q.id)).size).toBe(30)
    for (const q of questions) {
      expect(q.choices[q.correct]).toBeTruthy()
      expect(q.explanation.length).toBeGreaterThan(20)
      expect(q.source.url).toMatch(/^https:/)
    }
    for (const p of playbooks) {
      expect(new Set(p.steps.map((s) => s.id)).size).toBe(p.steps.length)
      expect(exportChecklist(p.id, [p.steps[0]!.id])).toContain('- [x]')
      expect(exportChecklist(p.id, [])).toContain('- [ ]')
    }
    expect(() => exportChecklist('missing', [])).toThrow()
  })
})
