import { describe, it, expect } from 'vitest'
import { chooseAction, initialSimulation, scenarioSchema, simulationScore } from './engine'
import { scenarios } from './scenarios'

describe('training engine', () => {
  it('has six validated synthetic scenarios', () => expect(scenarios).toHaveLength(6))
  it.each(scenarios)('completes $id using justified checks', (scenario) => {
    let state = initialSimulation()
    for (const step of scenario.steps) state = chooseAction(scenario, state, step.recommendedId)
    expect(state.completed).toBe(true)
    expect(simulationScore(state)).toBe(100)
    expect(state.history).toHaveLength(scenario.steps.length)
  })
  it('wrong choice gives evidence and penalty without skipping the step', () => {
    const scenario = scenarios[0]!
    const state = initialSimulation()
    const action = scenario.steps[0]!.choices.find(
      (c) => c.id !== scenario.steps[0]!.recommendedId,
    )!
    const next = chooseAction(scenario, state, action.id)
    expect(next.step).toBe(0)
    expect(next.mistakes).toBe(1)
    expect(simulationScore(next)).toBe(85)
    expect(chooseAction(scenario, next, action.id)).toBe(next)
    expect(state.history).toHaveLength(0)
  })
  it('rejects missing action references', () => {
    const scenario = scenarios[0]!
    expect(() => chooseAction(scenario, initialSimulation(), 'missing')).toThrow()
    expect(
      scenarioSchema.safeParse({
        ...scenario,
        steps: [{ ...scenario.steps[0], recommendedId: 'missing' }],
      }).success,
    ).toBe(false)
  })
  it('completed simulation ignores new actions', () => {
    const scenario = scenarios[0]!
    let state = initialSimulation()
    for (const step of scenario.steps) state = chooseAction(scenario, state, step.recommendedId)
    expect(chooseAction(scenario, state, 'missing')).toBe(state)
  })
  it('score never falls below zero', () =>
    expect(simulationScore({ ...initialSimulation(), mistakes: 20 })).toBe(0))
})
