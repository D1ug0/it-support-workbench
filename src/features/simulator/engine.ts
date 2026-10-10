import { z } from 'zod'

const choiceSchema = z
  .object({
    id: z.string().regex(/^[a-z\d-]{1,80}$/i),
    label: z.string().trim().min(1).max(2000),
    result: z.string().trim().min(1).max(2000),
    explanation: z.string().trim().min(1).max(2000),
    safe: z.boolean(),
  })
  .strict()
const stepSchema = z
  .object({
    id: z.string().regex(/^[a-z\d-]{1,80}$/i),
    question: z.string().trim().min(1).max(2000),
    recommendedId: z.string(),
    choices: z.array(choiceSchema).min(2).max(5),
  })
  .strict()
  .refine(
    (step) =>
      step.choices.some((c) => c.id === step.recommendedId && c.safe) &&
      new Set(step.choices.map((c) => c.id)).size === step.choices.length,
    {
      message: 'Выберите безопасное рекомендуемое действие; ID вариантов должны быть уникальными.',
    },
  )
export const scenarioSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z\d-]{1,80}$/i),
    title: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    difficulty: z.enum(['Начальный', 'Средний']),
    brief: z.string().trim().min(1).max(2000),
    context: z.string().trim().min(1).max(8000),
    resolution: z.string().trim().min(1).max(2000),
    steps: z.array(stepSchema).min(1).max(10),
  })
  .strict()
  .refine((scenario) => new Set(scenario.steps.map((s) => s.id)).size === scenario.steps.length, {
    message: 'ID этапов должны быть уникальными.',
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
