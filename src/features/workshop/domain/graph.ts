import { z } from 'zod'
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)
export const graphSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^GRAPH-[a-f0-9-]{36}$/),
    title: z.string().min(3).max(160),
    start: id,
    objectives: z.array(id).min(1).max(10).optional(),
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
                    proves: z.array(id).max(10).optional(),
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
    if (
      g.objectives &&
      (new Set(g.objectives).size !== g.objectives.length ||
        g.nodes.some((n) =>
          n.choices.some((c) => c.proves?.some((p) => !g.objectives!.includes(p))),
        ) ||
        g.objectives.some(
          (o) => !g.nodes.some((n) => n.choices.some((c) => c.useful && c.proves?.includes(o))),
        ))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Учебные цели должны быть уникальными и подтверждаться полезными переходами.',
      })
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
  proofs: string[]
  goalsMet: boolean
  status: 'active' | 'completed' | 'limit-reached' | 'abandoned'
  score: number
}
export function startGraph(g: IncidentGraph): GraphAttempt {
  return {
    node: g.start,
    steps: [],
    finished: false,
    status: 'active',
    proofs: [],
    goalsMet: false,
    score: 0,
  }
}
export function chooseGraph(g: IncidentGraph, a: GraphAttempt, index: number): GraphAttempt {
  const node = g.nodes.find((n) => n.id === a.node),
    choice = node?.choices[index]
  if (a.finished || !choice || a.steps.length >= 40) throw new Error('Недопустимый переход.')
  const steps = [...a.steps, { node: a.node, choice: index }]
  const status = choice.to === 'END' ? 'completed' : steps.length >= 40 ? 'limit-reached' : 'active'
  const unique = [...new Map(steps.map((s) => [`${s.node}:${s.choice}`, s])).values()]
  const useful = new Set(
    unique
      .filter((s) => g.nodes.find((n) => n.id === s.node)!.choices[s.choice]!.useful)
      .map((s) => s.node),
  )
  const wrong = unique.filter(
    (s) => !g.nodes.find((n) => n.id === s.node)!.choices[s.choice]!.useful,
  ).length
  // END is a learning goal, never a side effect of the safety limit. Repeated transitions add no evidence.
  const proofs = [
    ...new Set(
      unique.flatMap((s) => {
        const c = g.nodes.find((n) => n.id === s.node)!.choices[s.choice]!
        return c.useful ? (c.proves ?? []) : []
      }),
    ),
  ]
  const goalsMet =
    status === 'completed' && choice.useful && (g.objectives ?? []).every((o) => proofs.includes(o))
  const coverage = g.objectives
    ? proofs.filter((p) => g.objectives!.includes(p)).length / g.objectives.length
    : 1
  const quality = Math.max(
    0,
    Math.round((100 * useful.size) / Math.max(1, useful.size + wrong)) -
      Math.min(30, (steps.length - unique.length) * 2),
  )
  return {
    node: choice.to,
    steps,
    status,
    proofs,
    goalsMet,
    finished: status !== 'active',
    score: goalsMet ? quality : Math.min(70, Math.round(quality * coverage)),
  }
}
export function abandonGraph(a: GraphAttempt): GraphAttempt {
  return a.finished
    ? a
    : { ...a, finished: true, status: 'abandoned', score: Math.min(a.score, 70) }
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
  objectives: ['scope', 'evidence-escalation'],
  nodes: [
    {
      id: 'request',
      prompt: 'Пользователь сообщает: «Не открывается портал». Как уточнить симптом?',
      choices: [
        {
          label: 'Уточнить время, ошибку и затронутые устройства',
          to: 'evidence',
          proves: ['scope'],
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
          proves: ['evidence-escalation'],
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
