import type { SkillId } from './skills'
export const learningPackages = [
  {
    id: 'network',
    title: 'Сети: путь и размер пакета',
    skill: 'routing',
    lessons: ['ADDRESS', 'ROUTES', 'IPV6'],
    requires: 'Адрес и префикс, локальная доставка',
    steps: [
      'Сопоставьте ARP и доступность next hop; NAT/VLAN исследуйте на внешнем стенде.',
      'Сравните /24 и default route, затем метрики одинакового префикса.',
      'Сравните DF-пробы: 1472 + 28 и 1372 + 28; ICMP-отказ ещё не устанавливает PMTUD.',
      'Разберите ND/SLAAC и проверьте IPv4/IPv6 отдельно на своей VM.',
    ],
    question: 'Маршрут /24 metric=50 и /0 metric=1. Какой выбран внутри /24?',
    options: ['/24 по более длинному префиксу', '/0 по метрике', 'Оба случайно'],
    correct: 0,
    calculation: 'Какой IPv4 MTU нужен для ICMP payload=1372 и заголовков 28 байт?',
    answer: 1400,
    contradiction: 'Ping не ответил, TCP 443 успешен. Что подтверждено?',
    choices: [
      'HTTP точно исправен',
      'TCP доступен; TLS/HTTP ещё нужно проверить',
      'DNS нужно сменить',
    ],
    contradictionCorrect: 1,
    final: 'portal',
  },
  {
    id: 'web',
    title: 'DNS и веб: от имени до приложения',
    skill: 'dns',
    lessons: ['DNS', 'WEB', 'TLS'],
    requires: 'DNS A/AAAA и TCP',
    steps: [
      'Сравните прямой ответ DNS, TTL и negative cache.',
      'Для split DNS сравните сервер и контекст клиента; наличие записи не проверяет сервис.',
      'Разделите SNI/имя сертификата, цепочку доверия, часы и proxy.',
      'Проверьте readiness и пользовательскую операцию после HTTP 200.',
    ],
    question: 'TCP доступен, HTTP 503. Что проверять следующим?',
    options: [
      'Поменять маску',
      'Готовность приложения, зависимость и журнал',
      'Очистить все данные',
    ],
    correct: 1,
    calculation: 'TTL=180 секунд. Прошло 75 секунд. Сколько осталось?',
    answer: 105,
    contradiction: 'nslookup уже верен, клиентское разрешение старое. Что сопоставить?',
    choices: ['Кэш и используемый сервер', 'Только пароль', 'Всегда сертификат'],
    contradictionCorrect: 0,
    final: 'api',
  },
  {
    id: 'windows',
    title: 'Windows: служба и граница доступа',
    skill: 'identity',
    lessons: ['WINDOWS', 'IDENTITY', 'SECURITY'],
    requires: 'DNS и службы Windows',
    steps: [
      'Сопоставьте состояние службы и события по времени.',
      'Отделите доступность SMB от разрешений share/NTFS.',
      'Проверьте GPO в нужном пользовательском/компьютерном контексте.',
      'Время/Kerberos и AD проверяются на своей Windows VM; эскалируйте с доказательствами.',
    ],
    question: 'SMB отвечает Access denied. Обоснованный следующий шаг?',
    options: [
      'Отключить firewall всем',
      'Проверить пользователя, группы и права ресурса',
      'Выдать Everyone Full control',
    ],
    correct: 1,
    calculation: 'Отказ у 3 из 12 учебных пользователей. Какая доля в процентах?',
    answer: 25,
    contradiction: 'TCP 445 доступен, файл не читается. Что это показывает?',
    choices: [
      'Транспорт доступен; права ещё не подтверждены',
      'Все разрешения исправны',
      'Сервер выключен',
    ],
    contradictionCorrect: 0,
    final: 'smb',
  },
  {
    id: 'linux',
    title: 'Linux: служба, файл и журнал',
    skill: 'linux',
    lessons: ['LINUX', 'SERVICES'],
    requires: 'Процессы, пользователь службы',
    steps: [
      'На VM запишите user/group и владельца конфигурации.',
      'Сопоставьте systemctl status, journal и права файла.',
      'Проверьте сокет, диск и отдельную зависимость.',
      'Исправьте минимальное разрешение и повторите пользовательский запрос.',
    ],
    question: 'Процесс labsvc не читает конфигурацию. Сначала нужно…',
    options: [
      'chmod 777',
      'Сопоставить владельца, группу и права с пользователем службы',
      'Удалить конфигурацию',
    ],
    correct: 1,
    calculation: 'В chmod 640 какое числовое разрешение у группы?',
    answer: 4,
    contradiction: 'Процесс запущен, HTTP 503. Что следует?',
    choices: [
      'Всё исправно',
      'Процесс может работать без готовой зависимости',
      'Нужно переустановить ОС',
    ],
    contradictionCorrect: 1,
    final: 'api',
  },
  {
    id: 'operations',
    title: 'Контейнеры, копии и восстановление',
    skill: 'recovery',
    lessons: ['SERVICES', 'RECOVERY'],
    requires: 'Linux/сервисы и файловые данные',
    steps: [
      'Сравните running, healthcheck и readiness.',
      'Опишите зависимости и том данных; reset не должен удалять рабочие volumes.',
      'Выберите копию по целостности, схеме и RPO.',
      'Восстановите отдельно; измерьте RTO и проверьте пользовательскую операцию.',
    ],
    question: 'Создание backup завершилось. Следующая проверка?',
    options: [
      'Удалить исходник',
      'Восстановить отдельно и проверить содержимое/приложение',
      'Только имя файла',
    ],
    correct: 1,
    calculation: 'Отказ в 10:05, копия в 10:02. Потеря данных, минут?',
    answer: 3,
    contradiction: 'Контейнер running, readiness=false. Что подтверждено?',
    choices: [
      'Приложение готово',
      'Процесс существует; готовность ещё не подтверждена',
      'Все данные потеряны',
    ],
    contradictionCorrect: 1,
    final: 'recovery',
  },
  {
    id: 'git',
    title: 'Git и CI: содержимое и история',
    skill: 'git',
    lessons: ['GIT'],
    requires: 'Отдельный учебный репозиторий',
    steps: [
      'Снимите status, graph истории и diff.',
      'Создайте конфликт в двух ветках вымышленного репозитория.',
      'Разрешите содержимое, объясните merge/rebase и проверьте тесты.',
      'На незнакомой ветке повторите процесс; релиз и откат практикуйте локально без публикации.',
    ],
    question: 'Merge завершён, тесты CI падают. Обоснованный вывод?',
    options: [
      'Успешный merge доказывает правильность программы',
      'Нужно исследовать содержимое и падающую проверку',
      'Удалить тесты',
    ],
    correct: 1,
    calculation: 'После правки проходят 9 из 12 проверок. Процент успеха?',
    answer: 75,
    contradiction: 'Конфликт исчез, но поведение неверное. Что проверить?',
    choices: ['Содержимое объединения и тесты', 'Только название ветки', 'Сразу force push'],
    contradictionCorrect: 0,
    final: 'stand',
  },
] satisfies Array<{
  id: string
  title: string
  skill: SkillId
  lessons: string[]
  requires: string
  steps: string[]
  question: string
  options: string[]
  correct: number
  calculation: string
  answer: number
  contradiction: string
  choices: string[]
  contradictionCorrect: number
  final: string
}>
