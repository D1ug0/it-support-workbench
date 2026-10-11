import type { NetworkState } from './networkModel'
export const legacyCommands = [
  ['ipconfig /all', 'Настройки виртуального адаптера'],
  ['ipconfig /displaydns', 'Локальный DNS-кэш'],
  ['ipconfig /flushdns', 'Очистить виртуальный DNS-кэш'],
  ['nslookup portal.lab.example', 'Опросить настроенный DNS напрямую'],
  ['nslookup portal.lab.example 192.0.2.53', 'Опросить выбранный DNS'],
  ['ping portal.lab.example', 'Проверить ICMP Echo'],
  ['tracert portal.lab.example', 'Посмотреть учебный маршрут'],
  ['route print', 'Таблица маршрутов'],
  ['Resolve-DnsName portal.lab.example', 'Клиентское разрешение имени; учебный JSON'],
  ['Test-NetConnection portal.lab.example -Port 443', 'Проверить TCP; учебный JSON'],
  ['Get-NetIPConfiguration', 'Параметры адаптера; учебный JSON'],
  [
    'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53',
    'Изменить DNS виртуального адаптера',
  ],
] as const

export const networkCommands = [
  ['Get-NetIPInterface', 'MTU учебного интерфейса'],
  ['ping -f -l 1472 portal.lab.example', 'IPv4 DF-проба: нагрузка плюс 28 байт заголовков'],
  ['ping -f -l 1372 portal.lab.example', 'Меньшая DF-проба для сравнения'],
  ['Set-NetIPInterface -InterfaceIndex 12 -NlMtuBytes 1400', 'Изменить учебный MTU'],
  ['ipconfig /renew', 'Получить адрес по DHCP'],
  ['ipconfig /release', 'Освободить аренду'],
  [
    'Set-NetIPAddress -InterfaceIndex 12 -PrefixLength 24',
    'Изменить префикс виртуального интерфейса',
  ],
  ['lab set-gateway 192.0.2.1', 'Учебная форма изменения шлюза'],
  ['route delete 198.51.100.0', 'Удалить маршрут к сети портала'],
  ['Set-NetRoute -DestinationPrefix 198.51.100.0/24 -RouteMetric 50', 'Изменить метрику маршрута'],
  ['rasdial VPN /disconnect', 'Отключить виртуальный VPN'],
  ['wait 120', 'Продвинуть время лаборатории на 120 секунд'],
  ['curl -I https://portal.lab.example', 'Проверить учебные TLS и HTTP'],
  [
    'curl.exe -I https://portal.lab.example',
    'Явно вызвать native curl в Windows, без alias PowerShell 5.1',
  ],
  ['certutil -verify lab.cer', 'Посмотреть учебную цепочку сертификата'],
  ['w32tm /query /status', 'Посмотреть состояние часов'],
  ['w32tm /resync', 'Синхронизировать учебные часы'],
  [
    'Import-Certificate -FilePath lab-ca.cer -CertStoreLocation Cert:\\LocalMachine\\Root',
    'Доверять учебному CA',
  ],
  ['Get-Service', 'Состояние службы'],
  ['Start-Service WebApp', 'Запустить службу'],
  ['Restart-Service WebApp', 'Перезапустить учебное приложение'],
  ['Get-WinEvent -LogName System -MaxEvents 5', 'Синтетические события среды'],
  ['whoami /groups', 'Группы учебного пользователя'],
  ['Get-SmbConnection', 'Состояние учебной общей папки'],
  ['lab grant-share-access', 'Учебное предоставление доступа к папке'],
  ['gpresult /r', 'Учебная результирующая политика'],
  ['gpupdate /force', 'Обновить учебную политику'],
  ['ls -l /etc/lab/app.conf', 'Права учебного файла Linux'],
  ['chmod 640 /etc/lab/app.conf', 'Исправить права учебного файла'],
  ['systemctl status lab-app', 'Состояние учебной Linux-службы'],
  ['journalctl -u lab-app', 'Журнал учебной Linux-службы'],
  ['netsh wlan show interfaces', 'Состояние учебного Wi-Fi'],
  ['netsh wlan connect name=LabWiFi', 'Подключить виртуальный Wi-Fi'],
  ['Get-NetAdapterBinding', 'Состояние IPv6-компонента'],
  ['Enable-NetAdapterBinding -Name Ethernet -ComponentID ms_tcpip6', 'Включить IPv6 в модели'],
  ['ping -6 portal.lab.example', 'Проверить IPv6-компонент и учебный путь'],
] as const

export interface CommandDefinition {
  example: string
  description: string
  platform: 'Windows' | 'Windows PowerShell' | 'PowerShell 7' | 'Linux' | 'Модель'
  effect: 'read' | 'change'
  target: 'client' | 'server' | 'model'
  rights: 'user' | 'administrator'
  parameters: string
  profile?: string
}
type CommandMetadata = Pick<
  CommandDefinition,
  'platform' | 'effect' | 'target' | 'rights' | 'profile'
>
const windowsRead = {
  platform: 'Windows',
  effect: 'read',
  target: 'client',
  rights: 'user',
  profile: 'Windows CMD',
} as const
const windowsChange = { ...windowsRead, effect: 'change', rights: 'administrator' } as const
const powershellRead = {
  ...windowsRead,
  platform: 'Windows PowerShell',
  profile: 'Windows PowerShell 5.1 / PowerShell 7 на Windows; доступные модули',
} as const
const powershellChange = { ...powershellRead, effect: 'change', rights: 'administrator' } as const
const serverRead = { ...powershellRead, target: 'server' } as const
const serverChange = { ...powershellChange, target: 'server' } as const
const linuxRead = {
  ...windowsRead,
  platform: 'Linux',
  target: 'server',
  profile: 'Учебный Linux / systemd; ограниченные формы',
} as const
const modelRead = {
  ...windowsRead,
  platform: 'Модель',
  target: 'model',
  profile: 'Учебная команда',
} as const
const specs: Record<string, CommandMetadata> = {
  ipconfig: windowsRead,
  nslookup: windowsRead,
  ping: windowsRead,
  tracert: windowsRead,
  route: windowsRead,
  rasdial: windowsChange,
  certutil: windowsRead,
  w32tm: windowsRead,
  whoami: windowsRead,
  gpresult: windowsRead,
  gpupdate: windowsChange,
  netsh: windowsRead,
  'resolve-dnsname': powershellRead,
  'test-netconnection': powershellRead,
  'get-netipconfiguration': powershellRead,
  'get-netipinterface': powershellRead,
  'set-dnsclientserveraddress': powershellChange,
  'set-netipaddress': powershellChange,
  'set-netroute': powershellChange,
  'set-netipinterface': powershellChange,
  'get-netadapterbinding': powershellRead,
  'enable-netadapterbinding': powershellChange,
  'import-certificate': powershellChange,
  'get-service': serverRead,
  'start-service': serverChange,
  'restart-service': serverChange,
  'get-winevent': serverRead,
  'get-smbconnection': powershellRead,
  curl: {
    ...windowsRead,
    platform: 'PowerShell 7',
    profile: 'Native curl; -I означает HEAD. В Windows PowerShell 5.1 используйте curl.exe',
  },
  'curl.exe': {
    ...windowsRead,
    profile: 'Windows native curl.exe, включая Windows PowerShell 5.1',
  },
  ls: linuxRead,
  chmod: { ...linuxRead, effect: 'change', rights: 'administrator' },
  systemctl: linuxRead,
  journalctl: linuxRead,
  help: modelRead,
  cls: modelRead,
  wait: { ...modelRead, effect: 'change' },
  lab: modelRead,
}
export function normalizeCommandName(name: string) {
  const lower = name.toLowerCase()
  return specs[lower]?.platform === 'Linux' ? name : lower
}
export function commandMetadata(
  name: string,
  args: readonly string[] = [],
): CommandMetadata | undefined {
  const base = specs[normalizeCommandName(name)]
  if (!base) return undefined
  const first = args[0]?.toLowerCase()
  const changes =
    (name === 'ipconfig' && ['/renew', '/release', '/flushdns'].includes(first ?? '')) ||
    (name === 'route' && first === 'delete') ||
    (name === 'w32tm' && first === '/resync') ||
    (name === 'netsh' && args[1]?.toLowerCase() === 'connect') ||
    (name === 'lab' && ['repair', 'set-gateway', 'grant-share-access'].includes(first ?? ''))
  return changes
    ? { ...base, effect: 'change', rights: base.platform === 'Модель' ? 'user' : 'administrator' }
    : base
}
function defineCommand([example, description]: readonly [string, string]): CommandDefinition {
  const [rawName = '', ...args] = example.split(' ')
  const name = normalizeCommandName(rawName)
  const metadata = commandMetadata(name, args)
  if (!metadata) throw new Error(`Missing command contract: ${name}`)
  return { example, description, ...metadata, parameters: args.join(' ') || 'Без параметров' }
}
export function supportedCommands(state?: NetworkState): CommandDefinition[] {
  const base = [
    ...legacyCommands,
    ['help', 'Поддерживаемые формы и границы среды'],
    ['help nslookup', 'Справка по одной команде; после help укажите её имя'],
    ['cls', 'Очистить экран'],
    ['wait 120', 'Продвинуть модельное время'],
  ] as Array<readonly [string, string]>
  if (state) {
    base.push(...networkCommands.filter((c) => !c[0].startsWith('Set-NetRoute ')))
    for (const route of state.routes)
      base.push([
        `Set-NetRoute -DestinationPrefix ${route.network}/${route.prefix} -RouteMetric 50`,
        'Изменить метрику существующего маршрута',
      ])
    for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'])
      base.push([`Resolve-DnsName ${state.definition.target} -Type ${type}`, `Запрос ${type}`])
    if (state.hosts.length) {
      base.push(
        ['lab hosts', 'Все узлы'],
        ['lab verify-fleet', 'Проверить пользовательский сценарий всех пар'],
      )
      for (const host of state.hosts) {
        base.push([`lab inspect ${host.id}`, 'Параметры узла'])
        for (const action of state.definition.additionalHosts?.find((h) => h.id === host.id)
          ?.role === 'client'
          ? ['dns', 'online']
          : ['service', 'http', 'online'])
          base.push([`lab repair ${host.id} ${action}`, 'Изменить выбранный узел модели'])
      }
      for (const target of state.definition.additionalHosts?.filter((h) => h.role === 'server') ??
        [])
        base.push([`lab probe client ${target.id}`, 'DNS, TCP, HTTP пары узлов'])
    }
  }
  const unique = new Map<string, CommandDefinition>()
  for (const entry of base) {
    const example = state
      ? entry[0]
          .replaceAll('portal.lab.example', state.definition.target)
          .replaceAll('192.0.2.53', state.definition.dns)
          .replaceAll('192.0.2.1', state.definition.gateway)
      : entry[0]
    unique.set(example, defineCommand([example, entry[1]]))
  }
  return [...unique.values()]
}
export function commandHelp(state?: NetworkState, commandName?: string) {
  return supportedCommands(state)
    .filter(
      (command) =>
        !commandName || command.example.split(' ')[0]!.toLowerCase() === commandName.toLowerCase(),
    )
    .map(
      (c) =>
        `${c.example} — ${c.description} [${c.profile ?? c.platform}; узел модели: ${c.target}; ${c.effect === 'change' ? 'изменение' : 'чтение'}; ${c.rights === 'administrator' ? 'в реальной ОС нужны соответствующие права' : 'учебная операция в пределах доступных прав'}]`,
    )
    .join('\n')
}
export function unsupportedCommand(tokens: string[], state?: NetworkState) {
  const forms = supportedCommands(state).filter(
    (c) => c.example.split(' ')[0]!.toLowerCase() === tokens[0]?.toLowerCase(),
  )
  return forms.length
    ? `Неподдерживаемые параметры. Формы команды:\n${forms.map((c) => c.example).join('\n')}\nПодробности: help ${tokens[0]}.`
    : 'Неизвестная команда. Введите help для поддерживаемых форм.'
}
