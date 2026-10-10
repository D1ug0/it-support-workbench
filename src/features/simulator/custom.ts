import { z } from 'zod'
import { scenarioSchema, type Scenario } from './engine'
export const MAX_CUSTOM_SCENARIOS = 20
export const CUSTOM_STORAGE_BYTES = 1024 * 1024
export const customScenarioSchema = scenarioSchema
  .refine((s) => /^USR-[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(s.id), {
    message: 'Пользовательский ID должен иметь формат USR-UUID.',
  })
  .refine((s) => new TextEncoder().encode(JSON.stringify(s)).length <= 64 * 1024, {
    message: 'Сценарий превышает 64 KiB.',
  })
export const scenarioBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    scenarios: z.array(customScenarioSchema).min(1).max(MAX_CUSTOM_SCENARIOS),
  })
  .strict()
  .refine((b) => new Set(b.scenarios.map((s) => s.id)).size === b.scenarios.length, {
    message: 'В файле повторяются ID сценариев.',
  })
export function parseScenarioBundle(text: string) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Файл превышает 2 MiB.')
  return scenarioBundleSchema.parse(JSON.parse(text))
}
export function scenarioBundle(values: Scenario[]) {
  return JSON.stringify(
    scenarioBundleSchema.parse({ schemaVersion: 1, scenarios: values }),
    null,
    2,
  )
}
export function newStep(index: number): Scenario['steps'][number] {
  return {
    id: `step-${index}`,
    question: 'Какой следующий шаг обоснован?',
    recommendedId: 'check',
    choices: [
      {
        id: 'check',
        label: 'Собрать данные',
        result: 'Учебный результат проверки.',
        explanation: 'Проверка позволяет отделить наблюдение от предположения.',
        safe: true,
      },
      {
        id: 'guess',
        label: 'Сделать вывод без проверки',
        result: 'Данных недостаточно.',
        explanation: 'Сначала проверьте гипотезу.',
        safe: true,
      },
    ],
  }
}
export function newScenario(): Scenario {
  return {
    schemaVersion: 1,
    id: `USR-${crypto.randomUUID()}`,
    title: 'Мой учебный инцидент',
    category: 'Собственная практика',
    difficulty: 'Средний',
    brief: 'Опишите симптом и цель диагностики.',
    context: 'Только вымышленные данные: ПК lab.example, сеть 192.0.2.0/24.',
    resolution: 'Опишите подтверждённую причину и критерий восстановления.',
    steps: [newStep(1)],
  }
}
export function mergeScenarios(current: Scenario[], incoming: Scenario[]) {
  const valid = scenarioBundleSchema.parse({ schemaVersion: 1, scenarios: incoming }).scenarios
  const merged = new Map(current.map((s) => [s.id, customScenarioSchema.parse(s)]))
  valid.forEach((s) => merged.set(s.id, s))
  const values = [...merged.values()]
  if (
    values.length > MAX_CUSTOM_SCENARIOS ||
    new TextEncoder().encode(JSON.stringify(values)).length > CUSTOM_STORAGE_BYTES
  )
    throw new Error('Лимит: 20 сценариев и 1 MiB. Удалите ненужные сценарии.')
  return values
}
