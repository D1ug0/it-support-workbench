import { z } from 'zod'
export const traceSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(160),
    origin: z.enum(['synthetic', 'manual-export']),
    events: z
      .array(
        z
          .object({
            time: z.number().min(0).max(86400),
            layer: z.enum(['DNS', 'ICMP', 'TCP', 'TLS', 'HTTP', 'SERVICE']),
            result: z.enum(['ok', 'failure', 'info']),
            detail: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .refine(
    (v) => v.events.every((e, i) => i === 0 || e.time >= v.events[i - 1]!.time),
    'События должны быть упорядочены по времени.',
  )
export type TrainingTrace = z.infer<typeof traceSchema>
export const trainingTraces: TrainingTrace[] = [
  {
    schemaVersion: 1,
    title: 'Сеть работает, приложение возвращает 503',
    origin: 'synthetic',
    events: [
      { time: 0, layer: 'DNS', result: 'ok', detail: 'portal.lab.example → 198.51.100.20' },
      { time: 1, layer: 'TCP', result: 'ok', detail: 'Подключение к порту 443 установлено' },
      {
        time: 2,
        layer: 'TLS',
        result: 'ok',
        detail: 'Имя, срок и доверие проверены в учебной модели',
      },
      { time: 3, layer: 'HTTP', result: 'failure', detail: 'HTTP 503 Service Unavailable' },
      {
        time: 4,
        layer: 'SERVICE',
        result: 'failure',
        detail: 'Учебная зависимость приложения не готова',
      },
    ],
  },
  {
    schemaVersion: 1,
    title: 'ICMP молчит, HTTPS работает',
    origin: 'synthetic',
    events: [
      { time: 0, layer: 'DNS', result: 'ok', detail: 'portal.lab.example → 198.51.100.20' },
      { time: 1, layer: 'ICMP', result: 'failure', detail: 'Echo Reply не получен' },
      { time: 2, layer: 'TCP', result: 'ok', detail: 'TCP 443 установлен' },
      { time: 3, layer: 'TLS', result: 'ok', detail: 'Проверка сертификата успешна' },
      { time: 4, layer: 'HTTP', result: 'ok', detail: 'HTTP 200 OK' },
    ],
  },
  {
    schemaVersion: 1,
    title: 'TCP доступен, сертификат не прошёл проверку',
    origin: 'synthetic',
    events: [
      { time: 0, layer: 'DNS', result: 'ok', detail: 'portal.lab.example → 198.51.100.20' },
      { time: 1, layer: 'TCP', result: 'ok', detail: 'TCP 443 установлен' },
      { time: 2, layer: 'TLS', result: 'failure', detail: 'CA не найден в доверенном хранилище' },
      {
        time: 3,
        layer: 'HTTP',
        result: 'info',
        detail: 'HTTP-запрос не выполнен после ошибки TLS',
      },
    ],
  },
]
export function parseTrace(text: string) {
  if (new TextEncoder().encode(text).length > 131072) throw new Error('Трасса превышает 128 KiB.')
  return traceSchema.parse(JSON.parse(text))
}
