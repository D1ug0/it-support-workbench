export const professionalCases = [
  {
    id: 'unknown',
    title: 'Не открывается учебный портал',
    skill: 'dns',
    minutes: '30–45',
    requires: ['DNS и кэш', 'Маршруты', 'HTTP/readiness'],
    brief:
      'Клиент не может открыть учебный портал. Причина неизвестна: сравните клиентское разрешение и прямой DNS, путь и состояние приложения. Зафиксируйте гипотезы, выполните обоснованное изменение и проверьте запрос пользователя.',
    faults: [['cache'], ['dns'], ['route'], ['dependency']],
  },
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
export const faultIds = [
  'cache',
  'dns',
  'route',
  'service',
  'dependency',
  'permissions',
  'backup',
] as const
export const faultTitles: Record<(typeof faultIds)[number], string> = {
  cache: 'Клиентский кэш',
  dns: 'Клиентский DNS',
  route: 'Маршрут',
  service: 'Служба',
  dependency: 'Зависимость приложения',
  permissions: 'Права',
  backup: 'Копия данных',
}
export const actionIds = [
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
export const evidenceFor: Record<(typeof faultIds)[number], string[]> = {
  cache: ['dns'],
  dns: ['dns'],
  route: ['path'],
  service: ['journal'],
  dependency: ['http', 'journal'],
  permissions: ['permissions', 'scope'],
  backup: ['backup', 'content'],
}
