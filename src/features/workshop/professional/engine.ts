import { professionalCases, faultIds, actionIds, evidenceFor } from './definitions'
import { professionalAttemptSchema, type ProfessionalAttempt } from './model'
import { supportsFault, actionMinutes, hasExplanation } from './assessment'
import { upgradeLegacySteps } from './legacy'
export function startProfessional(
  caseId: ProfessionalAttempt['caseId'],
  variant = 0,
  seed?: number,
): ProfessionalAttempt {
  const c = professionalCases.find((c) => c.id === caseId)!
  const stableSeed =
    caseId === 'unknown'
      ? (seed ?? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!)
      : null
  if (stableSeed !== null) variant = stableSeed % 4
  if (!c.faults[variant]) throw new Error('Недоступный вариант инцидента.')
  return {
    id: globalThis.crypto.randomUUID(),
    storageToken: null,
    gradingVersion: 3,
    elapsedMinutes: 0,
    selectedSnapshot: null,
    restoredSnapshot: null,
    hypothesisFaults: [],
    hypotheses: [],
    seed: stableSeed,
    evidenceRefs: [],
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
export function actProfessional(
  original: ProfessionalAttempt,
  action: string,
  reason: string,
  evidenceRefs: number[] = [],
): ProfessionalAttempt {
  if (original.status !== 'active' || original.steps.length >= 60)
    throw new Error(
      'Попытка закрыта или достигнут лимит 60 действий. Сохраните разбор и начните новый вариант.',
    )
  if (!actionIds.includes(action) || !hasExplanation(reason) || reason.length > 600)
    throw new Error(
      'Выберите действие и сформулируйте гипотезу: минимум 20 символов и три разных слова, максимум 600 символов. Повтор одного символа не считается объяснением.',
    )
  const a = professionalAttemptSchema.parse(original)
  if (
    evidenceRefs.length > 10 ||
    new Set(evidenceRefs).size !== evidenceRefs.length ||
    evidenceRefs.some((id) => !Number.isInteger(id) || !a.steps[id - 1])
  )
    throw new Error('Выберите до десяти существующих проверок для обоснования изменения.')
  // Explicit continuation upgrades known legacy results once; historical completed scores are retained.
  a.steps = upgradeLegacySteps(a.steps)
  a.gradingVersion = 3
  a.elapsedMinutes =
    a.steps.reduce((time, s) => time + actionMinutes(s.action), 0) + actionMinutes(action)
  let result: string
  let outcome: NonNullable<ProfessionalAttempt['steps'][number]['outcome']> = 'observed'
  const violations: NonNullable<ProfessionalAttempt['steps'][number]['violations']> = []
  const findings: ProfessionalAttempt['steps'][number]['findings'] = []
  if (action.startsWith('repair:')) {
    const fault = action.slice(7) as (typeof faultIds)[number]
    const justified =
      evidenceFor[fault].every((o) => evidenceRefs.some((id) => a.steps[id - 1]?.action === o)) &&
      a.remaining.includes(fault) &&
      (a.caseId !== 'unknown' ||
        (supportsFault(a, fault, evidenceRefs) &&
          evidenceRefs.every((id) => a.steps[id - 1]?.revision === a.revision)))
    if (fault === 'permissions') {
      outcome = 'rejected'
      violations.push('permission-required')
      result = 'Нет прав изменять каталог. Подготовьте эскалацию владельцу доступа.'
    } else if (!justified) {
      outcome = 'rejected'
      violations.push('unjustified-change')
      result = 'Изменение не обосновано собранными данными; состояние не изменено.'
    } else if (fault === 'backup' && !a.selectedSnapshot) {
      outcome = 'rejected'
      violations.push('snapshot-required')
      result =
        'Выберите проверенную копию по времени и допустимой потере данных; состояние не изменено.'
    } else {
      a.remaining = a.remaining.filter((f) => f !== fault)
      a.repaired.push(fault)
      a.revision++
      a.verifiedRevision = null
      if (fault === 'backup') {
        a.restoredSnapshot = a.selectedSnapshot
        a.lossMinutes = a.restoredSnapshot === '10:02' ? 3 : 35
      }
      outcome = 'changed'
      result = `Минимальное учебное изменение выполнено. Ревизия ${a.revision}; требуется новая проверка.`
    }
  } else if (action === 'rollback') {
    const fault = a.repaired.pop()
    if (fault) {
      a.remaining.push(fault)
      a.revision++
      a.verifiedRevision = null
      if (fault === 'backup') {
        a.restoredSnapshot = null
        a.lossMinutes = null
      }
    }
    outcome = fault ? 'rolled-back' : 'no-change'
    result = fault
      ? 'Предыдущее изменение отменено; проверьте пользовательский запрос повторно.'
      : 'Изменений для отката нет.'
  } else if (action === 'escalate') {
    a.escalated =
      a.remaining.includes('permissions') &&
      ['permissions', 'scope', 'tcp'].every((o) =>
        evidenceRefs.some((id) => a.steps[id - 1]?.action === o),
      )
    outcome = a.escalated ? 'escalated' : 'rejected'
    if (!a.escalated) violations.push('insufficient-evidence')
    result = a.escalated
      ? 'Пакет эскалации: затронутые группы, успешный TCP, отказ доступа. Владелец доступа должен подтвердить восстановление; приложение этого не удостоверяет.'
      : 'Не хватает данных о масштабе, TCP и правах.'
  } else if (action === 'verify') {
    const operational =
      a.remaining.filter((f) => !(f === 'permissions' && a.escalated)).length === 0
    if (operational) a.verifiedRevision = a.revision
    outcome = operational ? (a.escalated ? 'escalation-verified' : 'verified') : 'failed-check'
    result = operational
      ? a.escalated
        ? 'Эскалация обоснована; восстановление доступа ожидает владельца.'
        : 'Учебный пользовательский запрос успешен во всех затронутых сегментах.'
      : 'Пользовательский запрос всё ещё не проходит. Проверьте независимые причины.'
  } else {
    a.observations = [...new Set([...a.observations, action])]
    const has = (f: (typeof faultIds)[number]) => a.remaining.includes(f)
    if (action === 'dns')
      findings.push(
        { fault: 'dns', present: has('dns') },
        { fault: 'cache', present: has('dns') ? null : has('cache') },
      )
    if (action === 'path') findings.push({ fault: 'route', present: has('route') })
    if (action === 'journal')
      findings.push(
        { fault: 'dependency', present: has('dependency') },
        { fault: 'service', present: has('dependency') ? null : has('service') },
      )
    if (action === 'permissions')
      findings.push({ fault: 'permissions', present: has('permissions') })
    if (action === 'backup') findings.push({ fault: 'backup', present: has('backup') })
    const outputs: Record<string, string> = {
      clarify:
        'Симптом получен в 10:05; требуется операция приложения, а не просто ping. Данные и имена вымышлены.',
      scope:
        a.caseId === 'unknown'
          ? 'Клиент A не открывает портал по имени. DNS и путь исследуются с клиента; журнал и HTTP/readiness доступны на учебном сервере независимо от клиентского подключения.'
          : a.caseId === 'smb'
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
        : `В новом окружении 12 заявок, схема v1, контрольная сумма копии ${a.restoredSnapshot ?? 'не выбрана'} совпала. Проверка содержимого: ревизия ${a.revision}. Нужна отдельная пользовательская операция.`,
    }
    result = outputs[action] ?? 'Наблюдение записано.'
  }
  a.steps.push({
    action,
    reason: reason.trim(),
    result,
    outcome,
    violations,
    revision: a.revision,
    evidenceRefs,
    findings,
  })
  if (a.caseId === 'recovery') a.recoveryMinutes = a.elapsedMinutes
  return a
}
