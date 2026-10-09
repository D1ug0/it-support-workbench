import { z } from 'zod'

const choiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  result: z.string().min(1),
  explanation: z.string().min(1),
  safe: z.boolean(),
})
const stepSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    recommendedId: z.string(),
    choices: z.array(choiceSchema).min(2).max(5),
  })
  .refine(
    (step) =>
      step.choices.some((c) => c.id === step.recommendedId) &&
      new Set(step.choices.map((c) => c.id)).size === step.choices.length,
    { message: 'Invalid recommended or duplicate action' },
  )
export const scenarioSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    title: z.string(),
    category: z.string(),
    difficulty: z.enum(['Начальный', 'Средний']),
    brief: z.string(),
    context: z.string(),
    resolution: z.string(),
    steps: z.array(stepSchema).min(1).max(10),
  })
  .refine((scenario) => new Set(scenario.steps.map((s) => s.id)).size === scenario.steps.length, {
    message: 'Duplicate step IDs',
  })
export type Scenario = z.infer<typeof scenarioSchema>
export interface SimulationState {
  step: number
  completed: boolean
  mistakes: number
  attempted: string[]
  history: Array<{
    step: number
    label: string
    result: string
    explanation: string
    correct: boolean
    safe: boolean
  }>
}
export const initialSimulation = (): SimulationState => ({
  step: 0,
  completed: false,
  mistakes: 0,
  attempted: [],
  history: [],
})
export function chooseAction(
  scenario: Scenario,
  state: SimulationState,
  choiceId: string,
): SimulationState {
  if (state.completed) return state
  const step = scenario.steps[state.step]
  const choice = step?.choices.find((c) => c.id === choiceId)
  if (!step || !choice) throw new Error('Unknown simulator action')
  const key = `${step.id}:${choiceId}`
  if (state.attempted.includes(key)) return state
  const correct = choiceId === step.recommendedId
  const next = state.step + (correct ? 1 : 0)
  return {
    ...state,
    step: next,
    completed: next >= scenario.steps.length,
    mistakes: state.mistakes + (correct ? 0 : 1),
    attempted: [...state.attempted, key],
    history: [
      ...state.history,
      {
        step: state.step,
        label: choice.label,
        result: choice.result,
        explanation: choice.explanation,
        correct,
        safe: choice.safe,
      },
    ],
  }
}
export const simulationScore = (state: SimulationState) => Math.max(0, 100 - state.mistakes * 15)
