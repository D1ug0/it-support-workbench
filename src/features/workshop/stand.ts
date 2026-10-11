import { z } from 'zod'
import type { SkillId } from './skills'
export const standTasks = [
  {
    id: 'windows',
    title: 'Windows: служба и причина отказа',
    skill: 'windows',
    platform: 'Windows',
    objective:
      'Различить остановленную службу и отказ её запуска из-за зависимости или конфигурации.',
    commands: ['Get-Service ИМЯ_УЧЕБНОЙ_СЛУЖБЫ', 'Get-WinEvent -LogName System -MaxEvents 30'],
    steps: [
      'Подготовьте отдельную учебную службу и снимок VM; запишите ожидаемое поведение.',
      'Сравните остановленную службу и отказ запуска: снимите status и относящиеся к ней события.',
      'Исправьте только подтверждённую причину в учебной среде, сохранив условия отката.',
      'Проверьте запуск, новые события и пользовательскую операцию.',
    ],
    question: 'Почему повторный Start-Service не исправляет отсутствующую зависимость?',
  },
  {
    id: 'ipv6',
    title: 'IPv6: компонент, адрес и маршрут',
    skill: 'ipv6',
    platform: 'Windows / собственная IPv6-сеть',
    objective: 'Отделить отключённый IPv6-компонент от отсутствующего адреса или маршрута.',
    commands: [
      'Get-NetAdapterBinding -ComponentID ms_tcpip6',
      'Get-NetIPAddress -AddressFamily IPv6',
      'Get-NetRoute -AddressFamily IPv6',
    ],
    steps: [
      'Запишите разрешённую IPv6-цель и рабочий план своего изолированного стенда.',
      'Снимите binding, адреса и маршруты; сравните с рабочим снимком.',
      'Исправьте подтверждённое условие своего стенда и объясните границу каждой проверки.',
      'Проверьте IPv6-сервис отдельно от IPv4; сохраните доказательства и условия отката.',
    ],
    question: 'Почему включённый IPv6 binding ещё не подтверждает маршрут к сервису?',
  },
  {
    id: 'wifi',
    title: 'Wi-Fi: ассоциация и сеть',
    skill: 'wifi',
    platform: 'Windows / собственная учебная точка доступа',
    objective:
      'Различить отсутствие подключения к точке и сетевой отказ после успешной ассоциации.',
    commands: [
      'netsh wlan show interfaces',
      'ipconfig /all',
      'Test-NetConnection ИМЯ_СВОЕГО_СТЕНДА -Port 443',
    ],
    steps: [
      'Используйте свою точку и разрешённый клиент; запишите рабочий SSID, адресацию и сервис.',
      'Сравните отсутствие ассоциации с сетевым отказом подключённого клиента.',
      'Измените только найденную настройку учебного стенда; не сбрасывайте всю сеть.',
      'Подтвердите ассоциацию, корректную адресацию и пользовательскую операцию.',
    ],
    question: 'Почему подключение к SSID ещё не подтверждает доступность приложения?',
  },
  {
    id: 'dns',
    title: 'Windows: клиентский DNS и кэш',
    skill: 'dns',
    platform: 'Windows',
    objective:
      'Отличить ответ выбранного DNS от результата клиентского кэша и подтвердить работу приложения.',
    commands: [
      'ipconfig /all',
      'ipconfig /displaydns',
      'nslookup ИМЯ_СВОЕГО_СТЕНДА',
      'Test-NetConnection ИМЯ_СВОЕГО_СТЕНДА -Port 443',
    ],
    steps: [
      'Снимите параметры адаптера и исходный отказ.',
      'Сравните прямой запрос DNS и кэш клиента.',
      'Исправьте только найденную настройку своего стенда.',
      'Повторите проверку имени и целевого сервиса.',
    ],
    question:
      'Почему успешный nslookup к указанному вручную серверу ещё не доказывает исправление клиентского DNS?',
  },
  {
    id: 'routes',
    title: 'Сети: путь и более специфичный маршрут',
    skill: 'routing',
    platform: 'Windows',
    objective: 'Объяснить выбранный маршрут по длине префикса и метрике, затем проверить сервис.',
    commands: [
      'route print',
      'tracert АДРЕС_СВОЕГО_СТЕНДА',
      'Test-NetConnection ИМЯ_СВОЕГО_СТЕНДА -Port 443',
    ],
    steps: [
      'Запишите план подсетей и исходную таблицу маршрутов.',
      'Найдите выбранный маршрут и доступность next hop.',
      'Исправьте маршрут только в изолированном стенде.',
      'Сравните путь до/после и доступность сервиса.',
    ],
    question: 'Когда маршрут с меньшей метрикой проигрывает другому маршруту?',
  },
  {
    id: 'linux',
    title: 'Linux: служба, журнал и права',
    skill: 'linux',
    platform: 'Linux',
    objective:
      'Связать отказ собственной учебной службы с записью журнала и правами её конфигурации.',
    commands: [
      'systemctl status ИМЯ_УЧЕБНОЙ_СЛУЖБЫ',
      'journalctl -u ИМЯ_УЧЕБНОЙ_СЛУЖБЫ --no-pager -n 30',
      'ls -l ПУТЬ_УЧЕБНОЙ_КОНФИГУРАЦИИ',
    ],
    steps: [
      'Сохраните рабочий снимок и параметры учебной службы.',
      'Снимите status, последние события и права файла.',
      'Исправьте минимально необходимое разрешение.',
      'Проверьте службу и пользовательский запрос.',
    ],
    question: 'Почему chmod 777 не является обоснованным исправлением отказа службы?',
  },
  {
    id: 'https',
    title: 'Приложение: TCP → TLS → HTTP',
    skill: 'tls',
    platform: 'Windows / Linux',
    objective: 'Различить транспортную доступность, доверие сертификату и готовность приложения.',
    commands: [
      'curl -I https://ИМЯ_СВОЕГО_СТЕНДА',
      'Test-NetConnection ИМЯ_СВОЕГО_СТЕНДА -Port 443',
    ],
    steps: [
      'Запишите ожидаемое имя и доверенную цепочку учебного CA.',
      'Проверьте отдельно TCP, TLS и HTTP.',
      'Исправьте подтверждённую причину в своём стенде.',
      'Подтвердите HTTPS без отключения проверки сертификата.',
    ],
    question: 'Как TCP 443 может работать одновременно с ошибкой HTTPS?',
  },
  {
    id: 'git',
    title: 'Git: расхождение истории и CI',
    skill: 'git',
    platform: 'Windows / Linux / macOS',
    objective:
      'На отдельном учебном репозитории понять расхождение веток и проверить результат объединения.',
    commands: ['git status', 'git log --oneline --graph --all -n 20', 'git diff'],
    steps: [
      'Создайте отдельный репозиторий с вымышленными файлами.',
      'Создайте две ветки с изменениями одного файла.',
      'Объедините изменения и объясните выбранное содержимое.',
      'Проверьте файл, тесты и итоговый граф истории.',
    ],
    question: 'Чем разрешение конфликта содержимого отличается от выбора merge или rebase?',
  },
  {
    id: 'recovery',
    title: 'Восстановление: проверить резервную копию',
    skill: 'recovery',
    platform: 'Windows / Linux / macOS',
    objective: 'Восстановить учебные данные в отдельное окружение и проверить их пригодность.',
    commands: [],
    steps: [
      'Запишите состав учебных данных и критерии успешного восстановления.',
      'Создайте копию без удаления источника.',
      'Восстановите в отдельную папку или VM.',
      'Проверьте содержимое и работу приложения, запишите потери и длительность.',
    ],
    question:
      'Почему успешное создание файла резервной копии ещё не доказывает возможность восстановления?',
  },
] satisfies Array<{
  id: string
  title: string
  skill: SkillId
  platform: string
  objective: string
  commands: string[]
  steps: string[]
  question: string
}>
export const standAttemptSchema = z
  .object({
    id: z.uuid(),
    attemptId: z.uuid().optional(),
    storageToken: z.uuid().nullable().default(null),
    taskId: z.enum([
      'dns',
      'routes',
      'linux',
      'https',
      'git',
      'recovery',
      'windows',
      'ipv6',
      'wifi',
    ]),
    at: z.iso.datetime(),
    platform: z.string().trim().min(1).max(160),
    completedSteps: z.array(z.number().int().min(0).max(3)).max(4),
    symptom: z.string().trim().min(5).max(1200),
    hypothesis: z.string().trim().min(5).max(1200),
    change: z.string().trim().min(5).max(1200),
    verification: z.string().trim().min(5).max(1200),
    answer: z.string().trim().min(10).max(1800),
  })
  .strict()
  .refine((v) => new Set(v.completedSteps).size === v.completedSteps.length)
export type StandAttempt = z.infer<typeof standAttemptSchema>
export function standMarkdown(value: StandAttempt) {
  const a = standAttemptSchema.parse(value),
    task = standTasks.find((t) => t.id === a.taskId)!
  return [
    `# ${task.title}`,
    `Самостоятельный отчёт о собственном стенде; приложение не удостоверяет выполнение.\nДата: ${a.at}\nОС: ${a.platform}`,
    `Шаги: ${a.completedSteps.map((i) => task.steps[i]).join('; ')}`,
    `## Симптом\n${a.symptom}`,
    `## Гипотеза\n${a.hypothesis}`,
    `## Изменение\n${a.change}`,
    `## Проверка\n${a.verification}`,
    `## Объяснение\n${a.answer}`,
  ].join('\n\n')
}
