import { isIPv4 } from '../../domain/network'
import type { CommandKind } from '../../domain/types/diagnostic'
import { commandExamples, terminalLabs, type LabId } from './catalog'

export const HOST = 'portal.lab.example'
export const PORTAL = '192.0.2.20'
export const DNS = '192.0.2.53'
export const OLD = '198.51.100.99'
export const eventIds = [
  'settings',
  'authority',
  'cache',
  'tcp-failure',
  'tcp-success',
  'icmp-failure',
] as const
export type LabEvent = (typeof eventIds)[number]
export interface LabState {
  labId: LabId
  dns: string
  cache: string | null
  revision: number
  verifiedRevision: number | null
  events: LabEvent[]
}
export interface CommandResult {
  state: LabState
  output: string
  kind?: CommandKind
  ok: boolean
  clear?: boolean
}
export function createEnvironment(labId: LabId): LabState {
  return {
    labId,
    dns: labId === 'TERM-DNS-SERVER' ? '192.0.2.54' : DNS,
    cache: labId === 'TERM-DNS-CACHE' ? OLD : null,
    revision: 0,
    verifiedRevision: null,
    events: [],
  }
}
function tokenize(command: string): string[] | undefined {
  if (
    !command.trim() ||
    command.length > 512 ||
    /[;|&<>`$]/.test(command) ||
    [...command].some(
      (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
    )
  )
    return
  const tokens: string[] = []
  let current = '',
    quote = ''
  for (const c of command.trim()) {
    if (quote) {
      if (c === quote) quote = ''
      else current += c
    } else if (c === '"' || c === "'") quote = c
    else if (/\s/.test(c)) {
      if (current) tokens.push(current)
      current = ''
    } else current += c
  }
  if (quote) return
  if (current) tokens.push(current)
  return tokens
}
const normalizedTarget = (value: string) => value.toLowerCase().replace(/\.$/, '')
function addEvent(state: LabState, event: LabEvent) {
  if (!state.events.includes(event)) state.events.push(event)
}
function lookup(state: LabState, name: string, server = state.dns): string | undefined {
  if (name === HOST) return server === DNS ? PORTAL : undefined
  if (name === 'dns.lab.example') return DNS
}
function resolve(state: LabState, name: string, explicitServer?: string): string | undefined {
  if (isIPv4(name)) return name
  if (explicitServer) return lookup(state, name, explicitServer)
  if (name === HOST && state.cache) return state.cache
  const answer = lookup(state, name)
  if (name === HOST && answer) state.cache = answer
  return answer
}
const known = (address: string | undefined) =>
  [PORTAL, DNS, '192.0.2.54', '192.0.2.1', '192.0.2.10'].includes(address ?? '')
const changed = (state: LabState) => {
  state.revision++
  state.verifiedRevision = null
}
function config(state: LabState) {
  return `Windows IP Configuration\n\n   Host Name . . . . . . . . . . . : TRAINING-PC\n\nEthernet adapter Ethernet:\n\n   Connection-specific DNS Suffix . : lab.example\n   Description . . . . . . . . . . : Virtual Ethernet Adapter\n   DHCP Enabled . . . . . . . . . : Yes\n   IPv4 Address . . . . . . . . . : 192.0.2.10(Preferred)\n   Subnet Mask . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . : 192.0.2.1\n   DNS Servers . . . . . . . . . : ${state.dns}\n`
}
function params(tokens: string[], allowed: string[]): Record<string, string> | undefined {
  if (tokens.length % 2) return
  const values: Record<string, string> = {}
  for (let i = 0; i < tokens.length; i += 2) {
    const key = tokens[i]!.toLowerCase(),
      value = tokens[i + 1]!
    if (!allowed.includes(key) || Object.hasOwn(values, key) || value.startsWith('-')) return
    values[key] = value
  }
  return values
}
export function executeCommand(original: LabState, command: string): CommandResult {
  const state = structuredClone(original)
  const fail = (
    output = 'Неподдерживаемые параметры. Введите help: доступны только описанные команды и формы синтаксиса.',
  ) => ({ state: original, output, ok: false })
  const tokens = tokenize(command)
  if (!tokens?.length)
    return fail(
      'Введите одну команду до 512 символов. Скрипты, конвейеры, перенаправления и управляющие символы не поддерживаются.',
    )
  if (state.revision >= 1000)
    return fail('Достигнут лимит изменений среды. Перезапустите лабораторию.')
  const [name = '', ...raw] = tokens,
    cmd = name.toLowerCase(),
    args = raw.map((t) => t.toLowerCase())
  const result = (output: string, kind?: CommandKind): CommandResult => ({
    state,
    output,
    kind,
    ok: true,
  })
  if (cmd === 'help' && !args.length)
    return result(
      `Учебная среда Windows: команды моделируются, ОС не запускается.\nЦель: ${HOST} (${PORTAL}), Ethernet / InterfaceIndex 12. Рабочий DNS: ${DNS}.\n\n${commandExamples.map(([c, d]) => `${c}\n  ${d}`).join('\n')}\n\nhelp · cls · история: ↑/↓ · дополнение: Tab · отмена ввода: Ctrl+C\nPowerShell здесь выдаёт выбранный JSON для анализатора. Полный язык и конвейеры не поддерживаются.`,
    )
  if (cmd === 'cls' && !args.length)
    return { ...result('Экран очищен. Состояние среды и проверки сохранены.'), clear: true }
  if (cmd === 'ipconfig') {
    if (!args.length || (args.length === 1 && args[0] === '/all')) {
      addEvent(state, 'settings')
      return result(config(state), 'ipconfig')
    }
    if (args.length === 1 && args[0] === '/displaydns') {
      addEvent(state, 'cache')
      return result(
        `Windows IP Configuration\n\n${state.cache ? `${HOST}\n  Record Type: 1\n  Time To Live: 300\n  A (Host) Record: ${state.cache}` : 'DNS Resolver Cache is empty.'}\n(Учебный кэш: TTL фиксирован; ход времени не моделируется.)`,
      )
    }
    if (args.length === 1 && args[0] === '/flushdns') {
      state.cache = null
      changed(state)
      return result(
        'Windows IP Configuration\nSuccessfully flushed the DNS Resolver Cache.\nОчищен только кэш виртуального ПК; адрес DNS-сервера не изменён.',
      )
    }
    return fail()
  }
  if (cmd === 'nslookup') {
    if (args.length < 1 || args.length > 2) return fail()
    const target = normalizedTarget(args[0]!),
      server = args[1] ?? state.dns
    if (![DNS, '192.0.2.54'].includes(server))
      return fail('В среде доступны DNS-серверы 192.0.2.53 и 192.0.2.54.')
    const address = lookup(state, target, server)
    if (target === HOST && server === DNS && address) addEvent(state, 'authority')
    return result(
      `Server: dns.lab.example\nAddress: ${server}\n\n${address ? `Non-authoritative answer:\nName: ${target}\nAddress: ${address}` : `*** dns.lab.example can't find ${target}: Non-existent domain`}`,
      'nslookup',
    )
  }
  if (cmd === 'set-dnsclientserveraddress') {
    const values = params(args, ['-interfaceindex', '-serveraddresses'])
    if (
      !values ||
      values['-interfaceindex'] !== '12' ||
      ![DNS, '192.0.2.54'].includes(values['-serveraddresses'] ?? '')
    )
      return fail()
    state.dns = values['-serveraddresses']!
    changed(state)
    return result(
      `DNS виртуального Ethernet изменён на ${state.dns}. Кэш сохранён. Выполните повторную проверку по имени.`,
    )
  }
  if (cmd === 'get-netipconfiguration' && !args.length) {
    addEvent(state, 'settings')
    return result(
      JSON.stringify(
        [
          {
            InterfaceIndex: 12,
            InterfaceAlias: 'Ethernet',
            IPv4Address: ['192.0.2.10'],
            IPv6Address: [],
            IPv4DefaultGateway: ['192.0.2.1'],
            DNSServer: [state.dns],
          },
        ],
        null,
        2,
      ),
      'powershell',
    )
  }
  if (cmd === 'resolve-dnsname') {
    if (!args[0] || args[0].startsWith('-')) return fail()
    const values = params(args.slice(1), ['-server', '-type'])
    if (
      !values ||
      (values['-type'] && values['-type'] !== 'a') ||
      (values['-server'] && ![DNS, '192.0.2.54'].includes(values['-server']))
    )
      return fail()
    const target = normalizedTarget(args[0]),
      address = resolve(state, target, values['-server'])
    if (!address) return result('DNS name does not exist. В учебной среде запись не найдена.')
    if (target === HOST && values['-server'] === DNS) addEvent(state, 'authority')
    return result(
      JSON.stringify(
        [{ Name: target, Type: 'A', TTL: 300, Section: 'Answer', IPAddress: address }],
        null,
        2,
      ),
      'dns-records',
    )
  }
  if (cmd === 'test-netconnection') {
    if (!args[0] || args[0].startsWith('-')) return fail()
    const values = params(args.slice(1), ['-port']),
      port = Number(values?.['-port'])
    if (
      !values ||
      !/^\d+$/.test(values['-port'] ?? '') ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      return fail()
    const target = normalizedTarget(args[0]),
      address = resolve(state, target),
      success = address === PORTAL && port === 443
    if (target === HOST && port === 443) {
      addEvent(state, success ? 'tcp-success' : 'tcp-failure')
      if (success) state.verifiedRevision = state.revision
    }
    // A failed DNS lookup has no RemoteAddress: do not invent a parsable address.
    if (!address)
      return result(
        `WARNING: Name resolution of ${target} failed\nTcpTestSucceeded: False\nDNS не вернул адрес. Сначала исследуйте разрешение имени.`,
      )
    return result(
      JSON.stringify(
        {
          ComputerName: target,
          RemoteAddress: address,
          RemotePort: port,
          SourceAddress: '192.0.2.10',
          InterfaceAlias: 'Ethernet',
          TcpTestSucceeded: success,
        },
        null,
        2,
      ),
      'powershell',
    )
  }
  if (cmd === 'ping') {
    if (!args[0] || args[0].startsWith('-')) return fail()
    const values = params(args.slice(1), ['-n']),
      count = Number(values?.['-n'] ?? 4)
    if (
      !values ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 4 ||
      (values['-n'] && !/^\d+$/.test(values['-n']))
    )
      return fail()
    const target = normalizedTarget(args[0]),
      address = resolve(state, target)
    if (!address)
      return result(
        `Ping request could not find host ${target}. Please check the name and try again.`,
        'ping',
      )
    const success = known(address) && !(address === PORTAL && state.labId === 'TERM-ICMP-TCP')
    if (target === HOST && !success) addEvent(state, 'icmp-failure')
    return result(
      `Pinging ${target} [${address}] with 32 bytes of data:\n${Array.from({ length: count }, () => (success ? `Reply from ${address}: bytes=32 time=1ms TTL=64` : 'Request timed out.')).join('\n')}\n\nPing statistics for ${address}:\n    Packets: Sent = ${count}, Received = ${success ? count : 0}, Lost = ${success ? 0 : count} (${success ? 0 : 100}% loss),\n${success ? 'Approximate round trip times in milli-seconds:\n    Minimum = 1ms, Maximum = 1ms, Average = 1ms' : ''}`,
      'ping',
    )
  }
  if (cmd === 'tracert' && args.length === 1) {
    const target = normalizedTarget(args[0]!),
      address = resolve(state, target)
    if (!address) return result(`Unable to resolve target system name ${target}.`)
    const arrives = known(address) && !(address === PORTAL && state.labId === 'TERM-ICMP-TCP')
    return result(
      `Tracing route to ${target} [${address}]\nover a maximum of 30 hops:\n\n  1    1 ms    1 ms    1 ms  192.0.2.1\n  2    ${arrives ? `1 ms    1 ms    1 ms  ${address}` : '*        *        *     Request timed out.'}\n\nTrace complete.`,
      'tracert',
    )
  }
  if (cmd === 'route' && args.length === 1 && args[0] === 'print')
    return result(
      'IPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0        192.0.2.1       192.0.2.10     25\n        192.0.2.0    255.255.255.0         On-link       192.0.2.10    281\n===========================================================================\nPersistent Routes:\n  None',
      'route',
    )
  return fail(
    `Команда «${name}» или эта форма синтаксиса не поддерживается. Введите help. Реальная ОС и сеть не используются.`,
  )
}
export function assessLab(state: LabState, diagnosis: number | undefined, hints = 0) {
  const lab = terminalLabs.find((l) => l.id === state.labId)!
  const checks: Array<{ label: string; met: boolean }> = []
  const event = (id: LabEvent) => state.events.includes(id)
  if (state.labId === 'TERM-DNS-SERVER')
    checks.push(
      { label: 'Изучить настройки адаптера', met: event('settings') },
      { label: 'Проверить ответ рабочего DNS-сервера', met: event('authority') },
      { label: 'Зафиксировать исходный отказ TCP по имени', met: event('tcp-failure') },
      {
        label: 'Указать рабочий DNS и подтвердить TCP по имени после изменения',
        met: state.dns === DNS && state.revision > 0 && state.verifiedRevision === state.revision,
      },
    )
  else if (state.labId === 'TERM-DNS-CACHE')
    checks.push(
      { label: 'Посмотреть клиентский DNS-кэш', met: event('cache') },
      { label: 'Сравнить с прямым ответом рабочего DNS', met: event('authority') },
      { label: 'Зафиксировать исходный отказ TCP по имени', met: event('tcp-failure') },
      {
        label: 'Получить актуальный адрес и подтвердить TCP после исправления',
        met:
          state.cache === PORTAL && state.revision > 0 && state.verifiedRevision === state.revision,
      },
    )
  else
    checks.push(
      { label: 'Проверить ICMP по имени портала', met: event('icmp-failure') },
      {
        label: 'Подтвердить TCP 443 по имени портала',
        met: event('tcp-success') && state.verifiedRevision === state.revision,
      },
      {
        label: 'Сохранить исходную конфигурацию: изменение не требуется',
        met: state.revision === 0,
      },
    )
  checks.push({
    label: 'Правильно объяснить причину и границу вывода',
    met: diagnosis === lab.correctCause,
  })
  return {
    checks,
    complete: checks.every((c) => c.met),
    score: Math.max(
      0,
      Math.round((100 * checks.filter((c) => c.met).length) / checks.length) -
        Math.min(3, Math.max(0, hints)) * 5,
    ),
  }
}
