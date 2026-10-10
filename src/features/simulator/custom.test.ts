import { describe, it, expect } from 'vitest'
import {
  newScenario,
  newStep,
  customScenarioSchema,
  parseScenarioBundle,
  scenarioBundle,
  mergeScenarios,
} from './custom'
import { chooseAction, initialSimulation } from './engine'
import { scenarios } from './scenarios'
describe('custom scenario validation', () => {
  it('round trips one or many user scenarios and preserves executable sequence', () => {
    const a = newScenario()
    a.steps.push(newStep(2))
    const parsed = parseScenarioBundle(scenarioBundle([a, newScenario()]))
    let state = initialSimulation()
    for (const step of parsed.scenarios[0]!.steps)
      state = chooseAction(parsed.scenarios[0]!, state, step.recommendedId)
    expect(state.completed).toBe(true)
    expect(state.history).toHaveLength(2)
  })
  it('updates by ID atomically in the quota calculation and never mutates inputs', () => {
    const a = newScenario(),
      b = newScenario()
    const current = [a]
    expect(mergeScenarios(current, [{ ...a, title: 'Updated' }, b])).toHaveLength(2)
    expect(current[0]?.title).toBe('Мой учебный инцидент')
    expect(mergeScenarios(current, [{ ...a, title: 'Updated' }])[0]?.title).toBe('Updated')
  })
  it('blocks builtin IDs, duplicate steps/actions, unknown fields and unsafe recommendation', () => {
    expect(customScenarioSchema.safeParse(scenarios[0]).success).toBe(false)
    const a = newScenario()
    for (const value of [
      { ...a, steps: [a.steps[0], a.steps[0]] },
      {
        ...a,
        steps: [{ ...a.steps[0], choices: [a.steps[0]!.choices[0], a.steps[0]!.choices[0]] }],
      },
      { ...a, raw: 'PRIVATE' },
      { ...a, steps: [{ ...a.steps[0], recommendedId: 'missing' }] },
      {
        ...a,
        steps: [
          { ...a.steps[0], choices: a.steps[0]!.choices.map((c) => ({ ...c, safe: false })) },
        ],
      },
    ])
      expect(customScenarioSchema.safeParse(value).success).toBe(false)
  })
  it('enforces per-field, per-file, scenario-count and per-scenario limits', () => {
    const a = newScenario()
    expect(customScenarioSchema.safeParse({ ...a, title: 'x'.repeat(121) }).success).toBe(false)
    expect(() => parseScenarioBundle('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MiB')
    expect(() => parseScenarioBundle('{')).toThrow()
    expect(() => mergeScenarios(Array.from({ length: 20 }, newScenario), [newScenario()])).toThrow(
      '20',
    )
    a.context = 'я'.repeat(8000)
    a.steps = Array.from({ length: 10 }, (_, i) => ({
      ...newStep(i + 1),
      question: 'я'.repeat(2000),
      choices: newStep(i + 1).choices.map((c) => ({ ...c, result: 'я'.repeat(2000) })),
    }))
    expect(customScenarioSchema.safeParse(a).success).toBe(false)
  })
  it('enforces byte quota across many individually valid scenarios', () => {
    const values = Array.from({ length: 20 }, () => {
      const value = newScenario()
      value.context = 'x'.repeat(8000)
      value.steps = Array.from({ length: 10 }, (_, i) => ({
        ...newStep(i + 1),
        question: 'x'.repeat(500),
        choices: newStep(i + 1).choices.map((c) => ({
          ...c,
          result: 'x'.repeat(1500),
          explanation: 'x'.repeat(500),
        })),
      }))
      return customScenarioSchema.parse(value)
    })
    expect(() => mergeScenarios(values, [values[0]!])).toThrow('1 MiB')
  })
  it('rejects duplicate IDs and unsupported schema versions', () => {
    const a = newScenario()
    expect(() =>
      parseScenarioBundle(JSON.stringify({ schemaVersion: 1, scenarios: [a, a] })),
    ).toThrow()
    expect(() =>
      parseScenarioBundle(JSON.stringify({ schemaVersion: 2, scenarios: [a] })),
    ).toThrow()
  })
})
