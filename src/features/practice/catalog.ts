import { calculateSubnet, isIPv4 } from '../../domain/network'

export interface PracticeTask {
  id: string
  topic: string
  title: string
  prompt: string
  format: 'ipv4' | 'number' | 'text' | 'order'
  expected: string[]
  explanation: string
  hint: string
  steps?: string[]
  course?: string
}
const subnetTasks: PracticeTask[] = (
  [
    ['network', '192.0.2.130', 25, 'Адрес сети'],
    ['broadcast', '198.51.100.77', 26, 'Последний адрес подсети'],
    ['hosts', '203.0.113.4', 30, 'Доступные адреса узлов'],
    ['mask', '192.0.2.10', 27, 'Маска подсети'],
    ['wildcard', '198.51.100.55', 28, 'Wildcard-маска'],
    ['firstHost', '192.0.2.99', 29, 'Первый адрес узла'],
    ['lastHost', '203.0.113.77', 26, 'Последний адрес узла'],
    ['hosts', '198.51.100.0', 31, 'Адреса point-to-point /31'],
  ] as const
).map(([field, address, prefix, title], index) => {
  const result = calculateSubnet(address, prefix)
  return {
    id: `subnet-${index + 1}`,
    topic: 'Подсети',
    title,
    prompt: `Рассчитайте: ${title.toLowerCase()} для ${address}/${prefix}. Введите ответ самостоятельно.`,
    format: field === 'hosts' ? 'number' : 'ipv4',
    expected: [String(result[field])],
    hint: 'Найдите размер блока 2^(32 − префикс), затем границы. Для /31 point-to-point доступны оба адреса.',
    explanation: `Блок: ${result.size} адресов. Сеть: ${result.network}/${prefix}, последний адрес: ${result.broadcast}, маска: ${result.mask}. Ответ: ${result[field]}. /31 использует специальную семантику point-to-point.`,
  }
})
const calculation = (
  id: string,
  title: string,
  prompt: string,
  expected: string,
  explanation: string,
  course: string,
): PracticeTask => ({
  id,
  topic: 'Протоколы и расчёты',
  title,
  prompt,
  format: 'number',
  expected: [expected],
  explanation,
  hint: 'Разделите условие на известные величины и искомую. Учитывайте именно ограничения, заданные в условии.',
  course,
})
const plan = (
  id: string,
  title: string,
  prompt: string,
  steps: string[],
  order: number[],
  explanation: string,
  course?: string,
): PracticeTask => ({
  id,
  topic: 'Планы диагностики',
  title,
  prompt,
  steps,
  format: 'order',
  expected: [order.join(',')],
  explanation,
  hint: 'Сначала контекст и свидетельства, затем проверки зависимостей, затем проверка гипотезы. Следуйте зависимостям именно этого условия.',
  course,
})
export const practiceTasks: PracticeTask[] = [
  ...subnetTasks,
  calculation(
    'mtu-payload',
    'IPv4 ICMP payload',
    'MTU интерфейса — 1500 байт. IPv4 без options: заголовок 20 байт, ICMP Echo — 8 байт. Какой максимальный payload для ping -l укладывается без фрагментации?',
    '1472',
    '1500 − 20 − 8 = 1472. Это расчёт для заданного интерфейса и заголовков; path MTU может быть меньше.',
    'vpn',
  ),
  calculation(
    'mtu-probe',
    'Размер успешной DF-пробы',
    'Пройдена IPv4 DF-проба с ping -l 1360. IPv4 header = 20, ICMP header = 8. Сколько байт в этом IP-пакете?',
    '1388',
    '1360 + 20 + 8 = 1388. Успешная проба подтверждает этот размер в момент проверки, а не точный максимальный PMTU.',
    'vpn',
  ),
  calculation(
    'capacity',
    'Подсеть для 60 узлов',
    'Нужны 60 адресов узлов в обычной IPv4-подсети: адреса сети и broadcast зарезервированы. Какой самый длинный префикс подходит? Введите число без /.',
    '26',
    '/26: 64 − 2 = 62 адреса; /27: 32 − 2 = 30, недостаточно.',
    'ipv6',
  ),
  calculation(
    'dns-ttl',
    'Остаток TTL',
    'TTL ответа равен 300 секундам. С момента получения прошло 180 секунд, кэш не обновлялся. Сколько секунд осталось по этой модели?',
    '120',
    '300 − 180 = 120. Это упрощённое условие; реальный клиент и промежуточные резолверы могут иметь собственную политику.',
    'dns',
  ),
  calculation(
    'srv-port',
    'SRV и транспорт',
    'SRV для _ldap._tcp содержит Port=389. Какой порт следует проверить для выбранного target? Введите число.',
    '389',
    'Проверяется TCP 389 выбранного target. SRV сообщает расположение сервиса, но не подтверждает его доступность.',
    'dns',
  ),
  calculation(
    'packet-loss',
    'Процент потерь Echo Reply',
    'Отправлено 20 Echo Request. Получено 15 Echo Reply, ICMP errors нет. Какой процент запросов не получил Echo Reply?',
    '25',
    '(20 − 15) / 20 × 100 = 25%. Причину потерь и доступность TCP этот расчёт не устанавливает.',
    'wifi',
  ),
  {
    id: 'srv-target',
    topic: 'Протоколы и расчёты',
    title: 'Приоритет SRV',
    prompt:
      'Две SRV-записи: dc-a.lab.example priority=10 weight=90; dc-b.lab.example priority=0 weight=10. Оба target доступны. Какой target предпочитается по приоритету?',
    format: 'text',
    expected: ['dc-b.lab.example'],
    hint: 'Меньшее значение priority предпочтительнее. Weight применяется между записями с одинаковым priority.',
    explanation:
      'dc-b.lab.example: priority=0 предпочтительнее priority=10. Больший weight другой группы не отменяет это.',
    course: 'dns',
  },
  {
    id: 'route-gateway',
    topic: 'Протоколы и расчёты',
    title: 'Маршрут по префиксу',
    prompt:
      'Цель 192.0.2.77. Маршруты: 0.0.0.0/0 → 198.51.100.1 metric=1; 192.0.2.0/24 → 198.51.100.2 metric=90. Какой next hop выигрывает по этим данным?',
    format: 'ipv4',
    expected: ['198.51.100.2'],
    hint: 'Сначала самый длинный совпадающий префикс, затем метрика между равными префиксами.',
    explanation:
      '/24 выигрывает у /0 до сравнения метрик. Next hop: 198.51.100.2. Политики Windows могут добавлять другие условия.',
    course: 'vpn',
  },
  {
    id: 'ipv6-record',
    topic: 'Протоколы и расчёты',
    title: 'Тип записи IPv6',
    prompt: 'Какой тип DNS-записи содержит IPv6-адрес? Введите обозначение типа.',
    format: 'text',
    expected: ['AAAA'],
    hint: 'A содержит IPv4; у IPv6 другой тип записи.',
    explanation:
      'AAAA содержит IPv6-адрес. Наличие записи ещё не подтверждает наличие IPv6-маршрута у клиента.',
    course: 'ipv6',
  },
  plan(
    'plan-tls',
    'План проверки HTTPS',
    'Для этой ситуации сначала нужен точный URL и ошибка. Затем исключите DNS и TCP; после этого сравните сертификат. Введите номера в нужной последовательности.',
    [
      'Проверить TCP 443 к полученному адресу',
      'Зафиксировать URL, ошибку и время',
      'Сравнить имя, срок и цепочку сертификата',
      'Проверить DNS того же имени',
    ],
    [2, 4, 1, 3],
    'Контекст → DNS → TCP → TLS. TCP не заменяет проверку сертификата.',
    'tls',
  ),
  plan(
    'plan-dns',
    'План split DNS',
    'Нужно сравнить прямой DNS-запрос с системным разрешением имени после VPN. Сначала подтвердите точное имя и контекст клиента.',
    [
      'Проверить системное разрешение и эффективную NRPT',
      'Зафиксировать имя, VPN и время',
      'Сравнить прямой запрос согласованному серверу',
      'Сопоставить результаты и передать подтверждённое различие',
    ],
    [2, 3, 1, 4],
    'Один успешный прямой запрос не доказывает, что системный резолвер использует тот же контекст.',
    'dns',
  ),
  plan(
    'plan-ad',
    'План Kerberos',
    'Есть ошибка SKEW. Для заданного плана сначала подтвердите пользователя, затем обнаружение доменных служб, источник времени и билеты.',
    [
      'Сверить время и источник времени',
      'Проверить пользователя и домен',
      'Посмотреть билеты и точную ошибку',
      'Проверить SRV и обнаружение DC',
    ],
    [2, 4, 1, 3],
    'Пользователь → DNS/DC → время → билеты. Кэшированный вход не подтверждает доступность KDC.',
    'ad',
  ),
  plan(
    'plan-smb',
    'План доступа к папке',
    'Для заданного плана сначала зафиксируйте UNC и операцию, проверьте соединение, затем реальный SMB-контекст и права.',
    [
      'Сопоставить share и NTFS для этой операции',
      'Зафиксировать UNC, операцию и ошибку',
      'Проверить TCP 445',
      'Уточнить пользователя SMB-соединения и группы',
    ],
    [2, 3, 4, 1],
    'Результирующий доступ зависит от контекста пользователя, share и NTFS. Успешный TCP не подтверждает разрешение.',
    'smb',
  ),
  plan(
    'plan-gpo',
    'План применения GPO',
    'Для этого плана сначала определите user/computer scope и время входа, затем gpresult, denied reason и изменение с владельцем политики.',
    [
      'Разобрать причину фильтрации',
      'Уточнить user/computer scope и время входа',
      'Передать факты владельцу политики',
      'Получить gpresult для нужного scope',
    ],
    [2, 4, 1, 3],
    'Scope → фактический результат → причина → согласованное изменение. Наличие GPO не означает применение.',
    'gpo',
  ),
  plan(
    'plan-dhcp',
    'План при APIPA',
    'Есть 169.254/16. В этой ситуации сначала определите нужный интерфейс, подтвердите DHCP и подключение, затем выясните масштаб и передайте факты.',
    [
      'Сравнить с другим клиентом в том же сегменте',
      'Выбрать нужный интерфейс и время',
      'Передать результаты владельцу DHCP/сети',
      'Сверить DHCP Enabled и состояние подключения',
    ],
    [2, 4, 1, 3],
    'APIPA — наблюдение о назначенном адресе. Оно не доказывает единственную причину отказа DHCP.',
  ),
  plan(
    'plan-vpn',
    'План пересечения подсетей',
    'Цель VPN недоступна. Для заданного плана сначала фиксируется адрес, потом маршруты, победивший префикс и сравнение с разрешённым альтернативным подключением.',
    [
      'Определить самый длинный совпадающий префикс',
      'Зафиксировать точный адрес цели',
      'Сравнить с согласованным другим подключением',
      'Получить route print и состояние VPN',
    ],
    [2, 4, 1, 3],
    'Специальный локальный маршрут может выиграть у default VPN. Меньшая метрика /0 не отменяет /24.',
    'vpn',
  ),
]
export function checkPractice(task: PracticeTask, raw: string) {
  const value = raw.trim()
  let normalized = value.toLowerCase().replace(/\.$/, '')
  let valid = value.length > 0 && value.length <= 200
  if (task.format === 'ipv4') valid = isIPv4(value)
  if (task.format === 'number') valid = /^(?:0|[1-9]\d{0,12})$/.test(value)
  if (task.format === 'order') {
    const parts = value.split(/[\s,;→-]+/).filter(Boolean)
    valid =
      parts.length === task.steps!.length &&
      parts.every((p) => /^[1-9]$/.test(p) && Number(p) <= parts.length) &&
      new Set(parts).size === parts.length
    normalized = parts.join(',')
  }
  return {
    valid,
    correct: valid && task.expected.some((e) => e.toLowerCase() === normalized),
    message: valid
      ? task.explanation
      : 'Проверьте формат: IPv4, целое число, обозначение или все номера шагов через запятую — согласно условию.',
  }
}
