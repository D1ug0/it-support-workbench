import { z } from 'zod'
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)
export const graphSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^GRAPH-[a-f0-9-]{36}$/),
    title: z.string().min(3).max(160),
    start: id,
    nodes: z
      .array(
        z
          .object({
            id,
            prompt: z.string().min(10).max(1200),
            choices: z
              .array(
                z
                  .object({
                    label: z.string().min(1).max(180),
                    to: id.or(z.literal('END')),
                    useful: z.boolean(),
                    explanation: z.string().min(10).max(700),
                  })
                  .strict(),
              )
              .min(2)
              .max(5),
          })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict()
  .superRefine((g, ctx) => {
    const ids = new Set(g.nodes.map((n) => n.id))
    if (
      ids.size !== g.nodes.length ||
      !ids.has(g.start) ||
      g.nodes.some((n) => n.choices.some((c) => c.to !== 'END' && !ids.has(c.to)))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Проверьте уникальность узлов, начальный узел и ссылки переходов.',
      })
      return
    }
    const reachable = new Set<string>()
    const todo = [g.start]
    while (todo.length) {
      const next = todo.pop()!
      if (reachable.has(next)) continue
      reachable.add(next)
      for (const c of g.nodes.find((n) => n.id === next)!.choices)
        if (c.to !== 'END') todo.push(c.to)
    }
    const ending = new Set(
      g.nodes.filter((n) => n.choices.some((c) => c.to === 'END')).map((n) => n.id),
    )
    let changed = true
    while (changed) {
      changed = false
      for (const n of g.nodes)
        if (!ending.has(n.id) && n.choices.some((c) => ending.has(c.to))) {
          ending.add(n.id)
          changed = true
        }
    }
    if (reachable.size !== ids.size || ending.size !== ids.size)
      ctx.addIssue({
        code: 'custom',
        message: 'Каждый узел должен быть достижим и иметь путь к завершению.',
      })
  })
export type IncidentGraph = z.infer<typeof graphSchema>
export interface GraphAttempt {
  node: string
  steps: Array<{ node: string; choice: number }>
  finished: boolean
  score: number
}
export function startGraph(g: IncidentGraph): GraphAttempt {
  return { node: g.start, steps: [], finished: false, score: 0 }
}
export function chooseGraph(g: IncidentGraph, a: GraphAttempt, index: number): GraphAttempt {
  const node = g.nodes.find((n) => n.id === a.node),
    choice = node?.choices[index]
  if (a.finished || !choice || a.steps.length >= 40) throw new Error('Недопустимый переход.')
  const steps = [...a.steps, { node: a.node, choice: index }],
    finished = choice.to === 'END' || steps.length >= 40
  return {
    node: choice.to,
    steps,
    finished,
    score: Math.round(
      (100 *
        steps.filter((s) => g.nodes.find((n) => n.id === s.node)!.choices[s.choice]!.useful)
          .length) /
        steps.length,
    ),
  }
}
export function parseGraph(text: string) {
  if (new TextEncoder().encode(text).length > 131072) throw new Error('Сценарий превышает 128 KiB.')
  return graphSchema.parse(JSON.parse(text))
}
export const sampleGraph: IncidentGraph = {
  schemaVersion: 1,
  id: 'GRAPH-00000000-0000-4000-8000-000000000001',
  title: 'Портал недоступен: уточнение и эскалация',
  start: 'request',
  nodes: [
    {
      id: 'request',
      prompt: 'Пользователь сообщает: «Не открывается портал». Как уточнить симптом?',
      choices: [
        {
          label: 'Уточнить время, ошибку и затронутые устройства',
          to: 'evidence',
          useful: true,
          explanation: 'Контекст помогает выбрать проверку и оценить масштаб отказа.',
        },
        {
          label: 'Перезагрузить всё без уточнения',
          to: 'request',
          useful: false,
          explanation: 'Действие не обосновано и может убрать диагностический контекст.',
        },
      ],
    },
    {
      id: 'evidence',
      prompt: 'DNS и TCP успешны, HTTP возвращает 503. Административных прав на сервер нет.',
      choices: [
        {
          label: 'Передать время, ответ HTTP и выполненные проверки владельцу приложения',
          to: 'END',
          useful: true,
          explanation: 'Эскалация содержит доказательства и границу уже проверенного.',
        },
        {
          label: 'Сменить клиентский DNS',
          to: 'request',
          useful: false,
          explanation: 'Успешное разрешение имени не обосновывает изменение DNS.',
        },
      ],
    },
  ],
}
