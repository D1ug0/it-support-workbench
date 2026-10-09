export interface KnowledgeEntry {
  id: string
  title: string
  category: string
  summary: string
  command?: string
  shell?: 'CMD' | 'PowerShell'
  checks: string[]
  limitation: string
  source: { title: string; url: string }
  reviewedAt: string
}
const entry = (value: Omit<KnowledgeEntry, 'reviewedAt'>): KnowledgeEntry => ({
  ...value,
  reviewedAt: '2026-10-09',
})
export const knowledgeEntries: KnowledgeEntry[] = [
  entry({
    id: 'ipconfig',
    title: 'Конфигурация сетевых адаптеров',
    category: 'DHCP',
    summary: 'Адреса, DNS, шлюзы и параметры DHCP каждого интерфейса.',
    command: 'ipconfig /all',
    shell: 'CMD',
    checks: [
      'Сначала выберите интерфейс, через который ожидается доступ.',
      'Проверьте DHCP, IPv4, маску, DNS и статус среды.',
      'Сопоставьте конфигурацию с нужным ресурсом и временем заявки.',
    ],
    limitation: 'Назначенный адрес не подтверждает доступность устройства или сервиса.',
    source: {
      title: 'Microsoft Learn · ipconfig',
      url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig',
    },
  }),
  entry({
    id: 'dns',
    title: 'Проверка DNS-ответа',
    category: 'DNS',
    summary: 'Отделите разрешение имени от подключения к приложению.',
    command: 'nslookup example.com',
    shell: 'CMD',
    checks: [
      'Замените example.com на разрешённое имя из задачи.',
      'Проверьте адрес использованного сервера и ответ на нужное имя.',
      'NXDOMAIN относится к конкретному запросу и DNS-контексту.',
    ],
    limitation:
      'Не меняйте DNS на публичный без понимания корпоративных зон и политики. Это может нарушить доступ к внутренним ресурсам.',
    source: {
      title: 'Microsoft Learn · nslookup',
      url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup',
    },
  }),
  entry({
    id: 'ping',
    title: 'ICMP: ответы и потери',
    category: 'Сеть',
    summary: 'Успешный Echo Reply показывает только ответ на ICMP-запрос.',
    command: 'ping -n 4 example.com',
    shell: 'CMD',
    checks: [
      'Сравните проверку разрешённого имени и адреса.',
      'Отличайте Echo Reply от сообщения Destination unreachable.',
      'Сопоставьте потери с проверкой нужного TCP-порта.',
    ],
    limitation: 'Тайм-аут не доказывает выключение хоста: ICMP может фильтроваться.',
    source: {
      title: 'Microsoft Learn · ping',
      url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping',
    },
  }),
  entry({
    id: 'tracert',
    title: 'Путь и молчащие переходы',
    category: 'Сеть',
    summary: 'Последовательность ответов маршрутизаторов на ICMP-пробы.',
    command: 'tracert example.com',
    shell: 'CMD',
    checks: [
      'Проверьте адрес цели в заголовке.',
      'Сопоставьте адрес последнего отвечающего хопа с целью.',
      'Смотрите на отвечающие переходы после звёздочек.',
    ],
    limitation:
      'Один молчащий маршрутизатор не доказывает разрыв пути. Асимметрия и ограничения ICMP меняют картину.',
    source: {
      title: 'Microsoft Learn · tracert',
      url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracert',
    },
  }),
  entry({
    id: 'vpn',
    title: 'Маршруты и контекст VPN',
    category: 'VPN',
    summary: 'VPN-подобный интерфейс — только признак; путь к ресурсу определяется маршрутами.',
    command: 'route print',
    shell: 'CMD',
    checks: [
      'Определите адрес конкретного ресурса.',
      'Найдите самый длинный подходящий префикс.',
      'Учитывайте семейство адресов, интерфейс и метрики.',
    ],
    limitation:
      'Отсутствие основного шлюза на VPN-интерфейсе может быть нормальным для отдельных маршрутов.',
    source: {
      title: 'Microsoft Learn · route',
      url: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/route_ws2008',
    },
  }),
  entry({
    id: 'tcp',
    title: 'Доступность TCP-порта',
    category: 'Сеть',
    summary: 'Проверка конкретного порта отличает уровень транспорта от ICMP.',
    command: 'Test-NetConnection example.com -Port 443',
    shell: 'PowerShell',
    checks: [
      'Подставьте только согласованные адрес и порт.',
      'Смотрите TcpTestSucceeded и RemoteAddress.',
      'При успешном TCP проверьте ошибки самого приложения.',
    ],
    limitation:
      'Read-only команда отправляет сетевые пакеты. Выполняйте её только для разрешённого ресурса. Приложение команды не запускает.',
    source: {
      title: 'Microsoft Learn · Test-NetConnection',
      url: 'https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection',
    },
  }),
  entry({
    id: 'cidr',
    title: 'Префиксы /31 и /32',
    category: 'Подсети',
    summary: 'У /31 на point-to-point два адреса, /32 описывает один адрес.',
    checks: [
      'Сначала определите назначение подсети.',
      '/31 применим к point-to-point по RFC 3021.',
      '/32 — отдельный адрес или host route.',
    ],
    limitation:
      'Математический диапазон не гарантирует, что конкретное оборудование поддерживает такую конфигурацию.',
    source: { title: 'RFC Editor · RFC 3021', url: 'https://www.rfc-editor.org/rfc/rfc3021' },
  }),
  entry({
    id: 'printer',
    title: 'Очередь и состояние принтера',
    category: 'Принтеры',
    summary: 'Сначала выясните масштаб проблемы: один компьютер, очередь или устройство.',
    command: 'Get-Printer',
    shell: 'PowerShell',
    checks: [
      'Сравните очередь и статус устройства.',
      'Проверьте, печатает ли другой согласованный клиент.',
      'Соберите точную ошибку до изменений spooler.',
    ],
    limitation: 'Массовая очистка очереди уничтожает задания. Не выполняйте её без согласования.',
    source: {
      title: 'Microsoft Learn · Get-Printer',
      url: 'https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printer',
    },
  }),
  entry({
    id: 'update',
    title: 'Сбой Windows Update',
    category: 'Windows',
    summary: 'Код ошибки, время и политика обновлений важнее универсального «сброса».',
    command: 'Get-Service wuauserv,bits',
    shell: 'PowerShell',
    checks: [
      'Запишите код ошибки и дату события.',
      'Проверьте свободное место и состояние служб.',
      'Сопоставьте с политикой WSUS/MDM и источником обновлений.',
    ],
    limitation: 'Не удаляйте SoftwareDistribution и не меняйте политики по одному симптому.',
    source: {
      title: 'Microsoft Learn · Windows Update troubleshooting',
      url: 'https://learn.microsoft.com/en-us/windows/deployment/update/windows-update-troubleshooting',
    },
  }),
  entry({
    id: 'apipa',
    title: 'Адрес 169.254/16 и DHCP',
    category: 'DHCP',
    summary: 'Link-local IPv4 может появиться, когда адрес DHCP не получен.',
    checks: [
      'Проверьте, включён ли DHCP.',
      'Проверьте физический линк и другие интерфейсы.',
      'Уточните, какой интерфейс нужен для заявки.',
    ],
    limitation: 'APIPA на одном адаптере не означает отсутствие интернета у компьютера.',
    source: {
      title: 'RFC Editor · IPv4 Link-Local',
      url: 'https://www.rfc-editor.org/rfc/rfc3927',
    },
  }),
]
export const categories = ['Все', ...new Set(knowledgeEntries.map((e) => e.category))]
