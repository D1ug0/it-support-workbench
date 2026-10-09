import { knowledgeEntries } from '../knowledge/catalog'
import type { CommandKind } from '../../domain/types/diagnostic'

export const scopes = [
  { id: 'single', label: 'Только у одного пользователя или устройства' },
  { id: 'many', label: 'У нескольких пользователей или устройств' },
  { id: 'unknown', label: 'Пока не знаю' },
] as const
export const symptoms = [
  {
    id: 'network',
    title: 'Нет доступа к сети',
    brief: 'Начнём с подключения и адреса компьютера.',
    question: 'Как подключён компьютер?',
    options: [
      ['wired', 'Кабелем'],
      ['wifi', 'По Wi-Fi'],
      ['unknown', 'Пока не знаю'],
    ],
    entries: ['ipconfig', 'ping', 'dns', 'tcp'],
    playbook: 'network',
    scenario: 'INC-DNS-001',
    topic: 'Сеть',
  },
  {
    id: 'site',
    title: 'Не открывается сайт',
    brief: 'Отделим имя сайта от соединения с ним.',
    question: 'Что именно не открывается?',
    options: [
      ['one', 'Один сайт или приложение'],
      ['all', 'Несколько сайтов'],
      ['unknown', 'Пока не знаю'],
    ],
    entries: ['ipconfig', 'dns', 'tcp'],
    playbook: 'dns',
    scenario: 'INC-DNS-001',
    topic: 'DNS',
  },
  {
    id: 'vpn',
    title: 'После VPN нет доступа',
    brief: 'Сравним адреса, DNS и маршрут до и после VPN.',
    question: 'Когда возникает проблема?',
    options: [
      ['vpn', 'Только при подключённом VPN'],
      ['always', 'И без VPN тоже'],
      ['unknown', 'Пока не знаю'],
    ],
    entries: ['ipconfig', 'dns', 'vpn', 'tcp'],
    playbook: 'vpn',
    scenario: 'INC-VPN-001',
    topic: 'Windows',
  },
  {
    id: 'printer',
    title: 'Не печатает принтер',
    brief: 'Уточним способ подключения и состояние очереди.',
    question: 'Как подключён принтер?',
    options: [
      ['usb', 'Напрямую по USB'],
      ['network', 'По сети'],
      ['unknown', 'Пока не знаю'],
    ],
    entries: ['printer'],
    playbook: 'printer',
    scenario: 'INC-PRINT-001',
    topic: 'Windows',
  },
  {
    id: 'update',
    title: 'Не устанавливается обновление',
    brief: 'Начнём с кода ошибки и состояния Windows Update.',
    question: 'У вас есть точный код ошибки?',
    options: [
      ['code', 'Да, код и время сбоя записаны'],
      ['missing', 'Нет, ещё не записал'],
      ['unknown', 'Пока не знаю'],
    ],
    entries: ['update'],
    playbook: 'update',
    scenario: 'INC-WINUPDATE-001',
    topic: 'Windows',
  },
] as const
export type SymptomId = (typeof symptoms)[number]['id']
export type ScopeId = (typeof scopes)[number]['id']
export interface GuideStep {
  id: string
  title: string
  why: string
  lookFor: string
  command?: string
  shell?: string
  kind?: CommandKind
  source?: { title: string; url: string }
  knowledgeTitle?: string
}
const descriptions: Record<
  string,
  { title: string; why: string; lookFor: string; kind?: CommandKind }
> = {
  ipconfig: {
    title: 'Посмотрите настройки нужного подключения',
    why: 'У одного компьютера могут быть Ethernet, Wi-Fi и VPN с разными настройками.',
    lookFor: 'Выберите нужный адаптер. Найдите его IP, DNS, шлюз и статус подключения.',
    kind: 'ipconfig',
  },
  ping: {
    title: 'Проверьте, приходит ли ICMP-ответ',
    why: 'Это одна проверка сети, а не проверка всего сайта.',
    lookFor:
      'Отличайте Reply от timeout и Destination unreachable. Отсутствие ответа не доказывает, что устройство выключено.',
    kind: 'ping',
  },
  dns: {
    title: 'Проверьте, превращается ли имя в адрес',
    why: 'Чтобы подключиться по имени, компьютер должен получить адрес ресурса.',
    lookFor:
      'Посмотрите выбранный DNS-сервер и адреса ответа на нужное имя. Ответ DNS ещё не подтверждает работу сайта.',
    kind: 'nslookup',
  },
  vpn: {
    title: 'Сравните маршрут к нужному ресурсу',
    why: 'VPN может направлять через себя только часть адресов.',
    lookFor:
      'Соберите route print до и после VPN. В инструментах укажите адрес ресурса и сравните подходящие маршруты.',
    kind: 'route',
  },
  tcp: {
    title: 'Проверьте соединение с портом сервиса',
    why: 'Ответ ping и соединение с приложением проверяют разные вещи.',
    lookFor:
      'Для согласованного ресурса и порта смотрите TcpTestSucceeded. Успешный TCP ещё не подтверждает TLS, вход и работу приложения.',
  },
  printer: {
    title: 'Посмотрите принтер и очередь',
    why: 'Сначала нужно различить проблему документа, клиента, очереди и устройства.',
    lookFor:
      'Сверьте выбранный принтер, статус задания, подключение и ошибку. Не удаляйте чужие задания для проверки.',
  },
  update: {
    title: 'Соберите ошибку и состояние служб',
    why: 'Без точного кода и времени легко исправлять не ту проблему.',
    lookFor:
      'Запишите код ошибки, время, версию Windows и контекст политики. Get-Service показывает состояние служб, а не исправляет обновление.',
  },
}
export function buildGuidePlan(id: SymptomId, scope: ScopeId, detail: string) {
  const symptom = symptoms.find((item) => item.id === id)
  if (
    !symptom ||
    !scopes.some((item) => item.id === scope) ||
    !symptom.options.some((option) => option[0] === detail)
  )
    throw new Error('Выберите симптом и ответьте на оба вопроса.')
  const ids: string[] = [...symptom.entries]
  if (id === 'printer' && detail === 'network') ids.push('ipconfig')
  if (id === 'vpn' && detail === 'always') {
    ids.splice(0, ids.length, 'ipconfig', 'dns', 'ping', 'tcp')
  }
  const steps: GuideStep[] = [
    {
      id: 'context',
      title: 'Уточните точную ошибку и масштаб',
      why:
        scope === 'many'
          ? 'Проблема затронула несколько пользователей. Это повод сопоставить время и общий ресурс, а не менять настройки каждого ПК.'
          : scope === 'unknown'
            ? 'Масштаб ещё неизвестен. Сначала уточните его: от этого зависит дальнейшая проверка.'
            : 'Определите, чем этот клиент отличается от другого разрешённого клиента.',
      lookFor:
        'Запишите время, точный текст ошибки, что работало раньше и что изменилось. Не записывайте пароли.',
    },
    ...ids.map((entryId) => {
      const entry = knowledgeEntries.find((item) => item.id === entryId)!
      return {
        id: entryId,
        ...descriptions[entryId]!,
        command: entry.command,
        shell: entry.shell,
        source: entry.source,
        knowledgeTitle: entry.title,
      }
    }),
  ]
  if (id === 'network' && detail !== 'unknown')
    steps.splice(1, 0, {
      id: 'connection',
      title:
        detail === 'wifi' ? 'Проверьте выбранную сеть Wi-Fi' : 'Проверьте физическое подключение',
      why: 'Нужно убедиться, что проверяется именно проблемное подключение.',
      lookFor:
        detail === 'wifi'
          ? 'Сверьте выбранную сеть, состояние подключения и сообщение Windows. Не подключайтесь к чужой сети для обхода проблемы.'
          : 'Посмотрите состояние адаптера и индикаторы. Сверьте кабель и согласованный порт; не переключайте оборудование других пользователей.',
    })
  if (id === 'update' && detail !== 'code')
    steps.splice(1, 0, {
      id: 'error-code',
      title: 'Запишите точный код ошибки обновления',
      why: 'Разные коды требуют разных проверок.',
      lookFor:
        'Откройте журнал обновлений в параметрах Windows. Запишите код, название обновления и время неудачной попытки.',
    })
  return {
    symptom,
    scopeLabel: scopes.find((item) => item.id === scope)!.label,
    detailLabel: symptom.options.find((option) => option[0] === detail)![1],
    steps,
  }
}
export type GuidePlan = ReturnType<typeof buildGuidePlan>
export function exportGuidePlan(plan: GuidePlan, done: string[]): string {
  return [
    `# План диагностики: ${plan.symptom.title}`,
    `Масштаб со слов пользователя: ${plan.scopeLabel}`,
    `Уточнение: ${plan.detailLabel}`,
    'Ответы и отметки пользователя не являются результатом автоматической проверки.',
    ...plan.steps.map(
      (step) =>
        `- [${done.includes(step.id) ? 'x' : ' '}] ${step.title}\n  Зачем: ${step.why}\n  Что смотреть: ${step.lookFor}${step.command ? `\n  Команда-пример (${step.shell ?? 'Windows'}): ${step.command}` : ''}${step.source ? `\n  Источник: ${step.source.url}` : ''}`,
    ),
    'Сетевые команды выполняет пользователь для разрешённого ресурса. Адрес example.com и порт 443 в примерах замените на согласованные для вашей задачи.',
  ].join('\n\n')
}
