import { z } from 'zod'
import { workshopDb, learningTables, assertStorageBudget } from './storage'
export const professionalCases = [
  {
    id: 'portal',
    title: 'Портал недоступен части клиентов',
    skill: 'dns',
    minutes: '30–60',
    requires: ['DNS и кэш', 'Маршруты', 'HTTP'],
    brief:
      'У части учебных клиентов портал не открывается. Восстановите пользовательский запрос всех клиентов, обоснуйте каждое изменение и подготовьте откат.',
    faults: [
      ['cache', 'service'],
      ['dns', 'route'],
      ['cache', 'dependency'],
    ],
  },
  {
    id: 'api',
    title: 'TCP доступен, API не готов',
    skill: 'services',
    minutes: '30–60',
    requires: ['TCP/TLS/HTTP', 'Readiness', 'Журнал'],
    brief:
      'Клиент подключается к API, но операция создания учебной заявки не проходит. Восстановите операцию и проверьте зависимость приложения.',
    faults: [['dependency'], ['service'], ['dependency', 'route']],
  },
  {
    id: 'smb',
    title: 'Доступ к общей папке',
    skill: 'identity',
    minutes: '30–45',
    requires: ['Права', 'SMB', 'Эскалация'],
    brief:
      'Часть учебных пользователей не может прочитать общий файл. У вас нет прав изменять группы каталога. Установите масштаб и подготовьте доказательную эскалацию.',
    faults: [['permissions'], ['permissions', 'dns'], ['permissions', 'route']],
  },
  {
    id: 'recovery',
    title: 'Восстановление учебного сервиса',
    skill: 'recovery',
    minutes: '45–90',
    requires: ['Копии', 'Зависимости', 'RTO/RPO'],
    brief:
      'Нужно восстановить учебные заявки в новом окружении, сохранив исходник. Допустима потеря не более 5 минут данных; срок восстановления — 20 минут. Проверьте содержимое и работу приложения.',
    faults: [
      ['backup', 'dependency'],
      ['backup', 'service'],
      ['backup', 'dependency', 'route'],
    ],
  },
] as const
const faultIds = [
  'cache',
  'dns',
  'route',
  'service',
  'dependency',
  'permissions',
  'backup',
] as const
const actionIds = [
  'clarify',
  'scope',
  'dns',
  'path',
  'tcp',
  'http',
  'journal',
  'permissions',
  'backup',
  'content',
  'verify',
  'rollback',
  'escalate',
  ...faultIds.map((f) => `repair:${f}`),
]
export const professionalAttemptSchema = z
  .object({
    id: z.uuid(),
    caseId: z.enum(['portal', 'api', 'smb', 'recovery']),
    variant: z.number().int().min(0).max(2),
    at: z.iso.datetime(),
    status: z.enum(['active', 'completed', 'abandoned']),
    revision: z.number().int().min(0).max(100),
    verifiedRevision: z.number().int().min(0).max(100).nullable(),
    remaining: z.array(z.enum(faultIds)).max(7),
    repaired: z.array(z.enum(faultIds)).max(7),
    observations: z.array(z.string().max(40)).max(30),
    steps: z
      .array(
        z
          .object({
            action: z.string().max(40),
            reason: z.string().max(600),
            result: z.string().max(600),
            revision: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .max(60),
    report: z
      .object({
        symptom: z.string().max(1200),
        hypothesis: z.string().max(1200),
        evidence: z.string().max(1800),
        change: z.string().max(1200),
        verification: z.string().max(1200),
      })
      .strict(),
    score: z.number().int().min(0).max(100).nullable(),
    escalated: z.boolean(),
    recoveryMinutes: z.number().min(0).max(1440).nullable(),
    lossMinutes: z.number().min(0).max(1440).nullable(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      new Set(a.remaining).size !== a.remaining.length ||
      new Set(a.repaired).size !== a.repaired.length ||
      a.remaining.some((f) => a.repaired.includes(f))
    )
      ctx.addIssue({ code: 'custom', message: 'Несогласованное состояние причин.' })
    if (a.status === 'completed' && !canCompleteProfessional(a))
      ctx.addIssue({
        code: 'custom',
        message: 'Завершение требует доказательств, отчёта и проверки пользовательского сценария.',
      })
  })
export type ProfessionalAttempt = z.infer<typeof professionalAttemptSchema>
export function startProfessional(
  caseId: ProfessionalAttempt['caseId'],
  variant = 0,
): ProfessionalAttempt {
  const c = professionalCases.find((c) => c.id === caseId)!
  return {
    id: globalThis.crypto.randomUUID(),
    caseId,
    variant,
    at: new Date().toISOString(),
    status: 'active',
    revision: 0,
    verifiedRevision: null,
    remaining: [...c.faults[variant]!] as ProfessionalAttempt['remaining'],
    repaired: [],
    observations: [],
    steps: [],
    report: { symptom: '', hypothesis: '', evidence: '', change: '', verification: '' },
    score: null,
    escalated: false,
    recoveryMinutes: null,
    lossMinutes: null,
  }
}
const evidenceFor: Record<(typeof faultIds)[number], string[]> = {
  cache: ['dns'],
  dns: ['dns'],
  route: ['path'],
  service: ['journal'],
  dependency: ['http', 'journal'],
  permissions: ['permissions', 'scope'],
  backup: ['backup', 'content'],
}
export function canCompleteProfessional(a: ProfessionalAttempt): boolean {
  const remaining = a.remaining.filter((f) => !(f === 'permissions' && a.escalated))
  const recovery =
    a.caseId !== 'recovery' ||
    (a.recoveryMinutes !== null &&
      a.recoveryMinutes <= 20 &&
      a.lossMinutes !== null &&
      a.lossMinutes <= 5 &&
      a.observations.includes('content'))
  return (
    remaining.length === 0 &&
    a.verifiedRevision === a.revision &&
    ['clarify', 'scope'].every((o) => a.observations.includes(o)) &&
    Object.values(a.report).every((v) => v.trim().length >= 10) &&
    recovery
  )
}
export function actProfessional(
  original: ProfessionalAttempt,
  action: string,
  reason: string,
): ProfessionalAttempt {
  if (original.status !== 'active' || original.steps.length >= 60)
    throw new Error(
      'Попытка закрыта или достигнут лимит 60 действий. Сохраните разбор и начните новый вариант.',
    )
  if (!actionIds.includes(action) || reason.trim().length < 10 || reason.length > 600)
    throw new Error(
      'Выберите действие и объясните, какую гипотезу оно проверяет (10–600 символов).',
    )
  const a = professionalAttemptSchema.parse(original)
  let result: string
  if (action.startsWith('repair:')) {
    const fault = action.slice(7) as (typeof faultIds)[number]
    const justified =
      evidenceFor[fault].every((o) => a.observations.includes(o)) && a.remaining.includes(fault)
    if (fault === 'permissions')
      result = 'Нет прав изменять каталог. Подготовьте эскалацию владельцу доступа.'
    else if (!justified)
      result = 'Изменение не обосновано собранными данными; состояние не изменено.'
    else {
      a.remaining = a.remaining.filter((f) => f !== fault)
      a.repaired.push(fault)
      a.revision++
      a.verifiedRevision = null
      result = `Минимальное учебное изменение выполнено. Ревизия ${a.revision}; требуется новая проверка.`
    }
  } else if (action === 'rollback') {
    const fault = a.repaired.pop()
    if (fault) {
      a.remaining.push(fault)
      a.revision++
      a.verifiedRevision = null
    }
    result = fault
      ? 'Предыдущее изменение отменено; проверьте пользовательский запрос повторно.'
      : 'Изменений для отката нет.'
  } else if (action === 'escalate') {
    a.escalated =
      a.remaining.includes('permissions') &&
      ['permissions', 'scope', 'tcp'].every((o) => a.observations.includes(o))
    result = a.escalated
      ? 'Пакет эскалации: затронутые группы, успешный TCP, отказ доступа. Владелец доступа должен подтвердить восстановление; приложение этого не удостоверяет.'
      : 'Не хватает данных о масштабе, TCP и правах.'
  } else if (action === 'verify') {
    const operational =
      a.remaining.filter((f) => !(f === 'permissions' && a.escalated)).length === 0
    if (operational) a.verifiedRevision = a.revision
    result = operational
      ? a.escalated
        ? 'Эскалация обоснована; восстановление доступа ожидает владельца.'
        : 'Учебный пользовательский запрос успешен во всех затронутых сегментах.'
      : 'Пользовательский запрос всё ещё не проходит. Проверьте независимые причины.'
  } else {
    a.observations = [...new Set([...a.observations, action])]
    const has = (f: (typeof faultIds)[number]) => a.remaining.includes(f)
    const outputs: Record<string, string> = {
      clarify:
        'Симптом получен в 10:05; требуется операция приложения, а не просто ping. Данные и имена вымышлены.',
      scope:
        a.caseId === 'smb'
          ? 'Отказ у группы interns, группа readers читает тот же файл.'
          : 'Сравнение клиентов A/B и серверов web/API: отказы независимы. Изменение одного клиента не доказывает исправность всех.',
      dns: has('dns')
        ? 'Клиент A использует DNS без нужной записи; прямой запрос к учебному DNS успешен.'
        : has('cache')
          ? 'Прямой DNS отвечает новым адресом, клиентский кэш содержит прежний адрес; TTL 180 с.'
          : 'DNS и клиентское разрешение согласованы.',
      path: has('route')
        ? 'Для API выбран более специфичный маршрут через недоступный next hop; default route рабочий.'
        : 'Учебный путь к приложению доступен.',
      tcp:
        has('service') || has('route')
          ? 'TCP выбранной пары не устанавливается.'
          : 'TCP-порт доступен. TLS, HTTP и права требуют отдельной проверки.',
      http: has('dependency')
        ? 'HTTP 503, readiness=false; TCP доступен. Обнаружение причины требует журнала.'
        : has('service')
          ? 'Служба не принимает пользовательский запрос.'
          : 'HTTP 200; проверьте операцию пользователя и содержимое.',
      journal: has('dependency')
        ? 'Учебный журнал: соединение с хранилищем отклонено; приложение запущено, зависимость недоступна.'
        : has('service')
          ? 'Учебный журнал: служба остановлена; настройки DNS не связаны с отказом.'
          : 'Ошибок зависимости в подготовленном журнале нет.',
      permissions: has('permissions')
        ? 'SMB отвечает отказом доступа группе interns; членство и ресурс требуют проверки владельцем каталога.'
        : 'Учебные разрешения чтения соответствуют цели.',
      backup: has('backup')
        ? 'Есть копии 09:30 и 10:02; последняя проверена по контрольной сумме. Отказ исходника в 10:05, допустимая потеря 5 минут.'
        : 'Выбрана пригодная копия, исходные данные сохранены.',
      content: has('backup')
        ? 'Предпросмотр 10:02: 12 учебных заявок, схема v1; старый пакет 09:30 нарушает RPO. Восстановление пока не выполнено.'
        : 'В новом окружении 12 заявок, контрольная сумма совпала. Нужно проверить пользовательскую операцию и длительность.',
    }
    result = outputs[action] ?? 'Наблюдение записано.'
  }
  a.steps.push({ action, reason: reason.trim(), result, revision: a.revision })
  return a
}
export function finishProfessional(a: ProfessionalAttempt): ProfessionalAttempt {
  if (!canCompleteProfessional(a))
    throw new Error(
      'Не выполнены цели: уточнение, масштаб, подтверждённое изменение/эскалация, свежая проверка и пять полей отчёта. Для восстановления также нужны RTO/RPO.',
    )
  const penalties = a.steps.filter((s) => s.result.includes('не обосновано')).length * 10
  return { ...a, status: 'completed', score: Math.max(0, 100 - Math.min(50, penalties)) }
}
export const professionalAttempts = workshopDb.table<ProfessionalAttempt, string>(
  'professionalAttempts',
)
export async function saveProfessional(value: ProfessionalAttempt) {
  const valid = professionalAttemptSchema.parse(value)
  await workshopDb.transaction('rw', learningTables(), async () => {
    if ((await professionalAttempts.count()) >= 50 && !(await professionalAttempts.get(valid.id)))
      throw new Error('Лимит: 50 профессиональных попыток.')
    await professionalAttempts.put(valid)
    await assertStorageBudget()
  })
}
export function professionalMarkdown(a: ProfessionalAttempt) {
  return [
    `# ${professionalCases.find((c) => c.id === a.caseId)!.title}`,
    `Синтетический учебный инцидент; вариант ${a.variant + 1}. Попытка ${a.id}. Статус ${a.status}, результат ${a.score ?? 'в процессе'}. Оценка проверяет структуру процесса, содержание обоснований проверяет человек.`,
    ...a.steps.map(
      (s, i) =>
        `${i + 1}. ${s.action} · ревизия ${s.revision}\nГипотеза: ${s.reason}\nНаблюдение: ${s.result}`,
    ),
    ...Object.entries(a.report).map(([k, v]) => `## ${k}\n${v}`),
    `Восстановление: ${a.recoveryMinutes ?? 'не указано'} мин; потеря ${a.lossMinutes ?? 'не указано'} мин.`,
  ].join('\n\n')
}
