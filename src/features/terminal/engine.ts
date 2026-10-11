import { tokenizeCommand, parseCommandTokens } from './commandSyntax'
import { commandHelp, unsupportedCommand } from './commandRegistry'
import { isIPv4 } from '../../domain/network'
import type { CommandKind } from '../../domain/types/diagnostic'
import { terminalLabs, type LabId } from './catalog'
import { definitionState, variant } from './labDefinitions'
import { createNetwork, assessNetwork, type LabDefinition, type NetworkState } from './networkModel'
import { executeNetwork } from './networkEngine'
import type { TerminalAssessment, TerminalCheck } from './assessment'

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
  network?: NetworkState
  clock?: number
  cacheExpires?: number
  negativeUntil?: number
}
export interface CommandResult {
  state: LabState
  output: string
  kind?: CommandKind
  ok: boolean
  clear?: boolean
}
export function createEnvironment(labId: LabId, definition?: LabDefinition, seed = 0): LabState {
  const network = definition
    ? createNetwork(seed ? variant(definition, seed) : definition)
    : definitionState(labId, seed)
  if (!network && !terminalLabs.some((l) => l.id === labId))
    throw new Error('Неизвестная лаборатория.')
  return {
    labId,
    dns: labId === 'TERM-DNS-SERVER' ? '192.0.2.54' : DNS,
    cache: labId === 'TERM-DNS-CACHE' ? OLD : null,
    revision: 0,
    verifiedRevision: null,
    events: [],
    ...(network ? { network, dns: network.dns } : {}),
  }
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
  if (name === HOST && state.cache && (state.cacheExpires ?? 300) > (state.clock ?? 0))
    return state.cache
  if (name === HOST && (state.negativeUntil ?? 0) > (state.clock ?? 0)) return undefined
  const answer = lookup(state, name)
  if (name === HOST && answer) {
    state.cache = answer
    state.cacheExpires = (state.clock ?? 0) + 300
    state.negativeUntil = 0
  }

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
  const fail = (output?: string) => ({
    state: original,
    output: output ?? unsupportedCommand(tokens ?? []),
    ok: false,
  })
  const tokens = tokenizeCommand(command)
  if (!tokens?.length)
    return fail(
      'Введите одну команду до 512 символов. Скрипты, конвейеры, перенаправления и управляющие символы не поддерживаются.',
    )
  if (state.revision >= 1000)
    return fail('Достигнут лимит изменений среды. Перезапустите лабораторию.')
  if (state.network) {
    const value = executeNetwork(state.network, tokens)
    return {
      ...value,
      state: value.ok
        ? {
            ...state,
            network: value.state,
            dns: value.state.dns,
            cache: value.state.cache?.address ?? null,
            revision: value.state.revision,
            verifiedRevision: value.state.verifiedRevision,
          }
        : original,
    }
  }
  const { cmd, args } = parseCommandTokens(tokens)
  const result = (output: string, kind?: CommandKind): CommandResult => ({
    state,
    output,
    kind,
    ok: true,
  })
  if (
    cmd === 'wait' &&
    args.length === 1 &&
    /^\d+$/.test(args[0]!) &&
    Number(args[0]) >= 1 &&
    Number(args[0]) <= 3600
  ) {
    state.clock = Math.min(86400, (state.clock ?? 0) + Number(args[0]))
    if (state.cache && (state.cacheExpires ?? 300) <= state.clock) {
      state.cache = null
      changed(state)
    }
    if ((state.negativeUntil ?? 0) <= state.clock) state.negativeUntil = 0
    return result(
      `Время лаборатории: ${state.clock} с. TTL кэша уменьшается; истёкшие записи удаляются.`,
    )
  }
  if (cmd === 'help' && !args.length)
    return result(
      `Учебная среда Windows: команды моделируются, ОС не запускается.\nЦель: ${HOST} (${PORTAL}), Ethernet / InterfaceIndex 12. Рабочий DNS: ${DNS}.\n\n${commandHelp()}\n\nhelp · cls · история: ↑/↓ · дополнение: Tab · отмена ввода: Ctrl+C\nPowerShell здесь выдаёт выбранный JSON для анализатора. Полный язык и конвейеры не поддерживаются.`,
    )
  if (cmd === 'help' && args.length === 1) {
    const text = commandHelp(undefined, args[0])
    return text
      ? result(
          `Учебные формы команды ${args[0]}:\n${text}\nСправка показывает синтаксис модели, а не выбранное исправление.`,
        )
      : fail(`Для «${args[0]}» нет учебной справки. Введите help для списка команд.`)
  }
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
        `Windows IP Configuration\n\n${state.cache ? `${HOST}\n  Record Type: 1\n  Time To Live: ${Math.max(0, (state.cacheExpires ?? 300) - (state.clock ?? 0))}\n  A (Host) Record: ${state.cache}` : 'DNS Resolver Cache is empty.'}\n(Учебное время: wait 120 продвигает часы на 120 секунд.)`,
      )
    }
    if (args.length === 1 && args[0] === '/flushdns') {
      state.cache = null
      state.negativeUntil = 0
      state.cacheExpires = 0
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
      (values['-type'] && values['-type'].toUpperCase() !== 'A') ||
      (values['-server'] && ![DNS, '192.0.2.54'].includes(values['-server']))
    )
      return fail()
    const target = normalizedTarget(args[0]),
      address = resolve(state, target, values['-server'])
    if (!address) return result('DNS name does not exist. В учебной среде запись не найдена.')
    if (target === HOST && values['-server'] === DNS) addEvent(state, 'authority')
    return result(
      JSON.stringify(
        [
          {
            Name: target,
            Type: 'A',
            TTL: values['-server']
              ? 300
              : Math.max(0, (state.cacheExpires ?? 300) - (state.clock ?? 0)),
            Section: 'Answer',
            IPAddress: address,
          },
        ],
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
      `Tracing route to ${target} [${address}]\nover a maximum of 30 hops:\n\n  1    ${arrives ? `1 ms    1 ms    1 ms  ${address}` : '*        *        *     Request timed out.'}\n\nTrace complete.`,
      'tracert',
    )
  }
  if (cmd === 'route' && args.length === 1 && args[0] === 'print')
    return result(
      'IPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0        192.0.2.1       192.0.2.10     25\n        192.0.2.0    255.255.255.0         On-link       192.0.2.10    281\n===========================================================================\nPersistent Routes:\n  None',
      'route',
    )
  return fail()
}
export function assessLab(
  state: LabState,
  diagnosis: number | undefined,
  hints = 0,
): TerminalAssessment {
  if (state.network) return assessNetwork(state.network, diagnosis, hints)
  const lab = terminalLabs.find((l) => l.id === state.labId)!
  const checks: TerminalCheck[] = []
  const event = (id: LabEvent) => state.events.includes(id)
  if (state.labId === 'TERM-DNS-SERVER')
    checks.push(
      { id: 'configuration', label: 'Изучить настройки адаптера', met: event('settings') },
      { id: 'authority', label: 'Проверить ответ рабочего DNS-сервера', met: event('authority') },
      { id: 'baseline', label: 'Зафиксировать отказ TCP по имени', met: event('tcp-failure') },
      {
        id: 'verification',
        label: 'Указать рабочий DNS и подтвердить TCP по имени после изменения',
        met: state.dns === DNS && state.revision > 0 && state.verifiedRevision === state.revision,
      },
    )
  else if (state.labId === 'TERM-DNS-CACHE')
    checks.push(
      { id: 'cache', label: 'Посмотреть клиентский DNS-кэш', met: event('cache') },
      { id: 'authority', label: 'Сравнить с прямым ответом рабочего DNS', met: event('authority') },
      { id: 'baseline', label: 'Зафиксировать отказ TCP по имени', met: event('tcp-failure') },
      {
        id: 'verification',
        label: 'Получить актуальный адрес и подтвердить TCP после исправления',
        met:
          state.cache === PORTAL && state.revision > 0 && state.verifiedRevision === state.revision,
      },
    )
  else
    checks.push(
      { id: 'icmp', label: 'Проверить ICMP по имени портала', met: event('icmp-failure') },
      {
        id: 'verification',
        label: 'Подтвердить TCP 443 по имени портала',
        met: event('tcp-success') && state.verifiedRevision === state.revision,
      },
      {
        id: 'preserve',
        label: 'Сохранить исходную конфигурацию: изменение не требуется',
        met: state.revision === 0,
      },
    )
  checks.push({
    id: 'diagnosis',
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
