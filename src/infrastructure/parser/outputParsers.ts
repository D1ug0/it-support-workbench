import type { CommandKind, ParseResult, ParseWarning } from '../../domain/types/diagnostic'
import type {
  ParsedPing,
  ParsedNslookup,
  ParsedTracert,
  ParsedRoutes,
} from '../../domain/types/outputs'
import { isIPAddress, isIPv4, isIPv6, maskToPrefix } from '../../domain/network'
import { normalizeInput, validateInput } from './normalizeInput'

function prepare(text: string, kind: CommandKind) {
  const normalized = normalizeInput(text)
  const error = validateInput(normalized)
  return { lines: normalized.split('\n'), error, kind }
}
function invalid<T>(kind: CommandKind, message: string): ParseResult<T> {
  return { status: 'invalid', kind, warnings: [{ code: 'INPUT_INVALID', message }] }
}
const range = (line: number) => ({ startLine: line, endLine: line })
export function parsePing(text: string): ParseResult<ParsedPing> {
  const { lines, error } = prepare(text, 'ping')
  if (error) return invalid('ping', error)
  const value: ParsedPing = { kind: 'ping', replies: [] }
  const warnings: ParseWarning[] = []
  lines.forEach((line, index) => {
    const target =
      /^(?:Pinging|Обмен пакетами с)\s+(.+?)(?:\s+with\s+|\s+с\s+\d+|\s+по\s+\d+)/i.exec(
        line.trim(),
      )
    if (target) value.target = target[1]
    if (/Request timed out|Превышен интервал ожидания|Истек срок ожидания/i.test(line))
      value.replies.push({ line: index + 1, outcome: 'timeout' })
    else if (/Destination .*unreachable|недоступен|недостижим/i.test(line))
      value.replies.push({ line: index + 1, outcome: 'unreachable' })
    else if (/^(?:Reply from|Ответ от)/i.test(line.trim())) {
      const time = /(?:time|время)\s*([=<])\s*(\d+)\s*(?:ms|мс)/i.exec(line)
      if (time)
        value.replies.push({
          line: index + 1,
          outcome: 'reply',
          timeMs: Number(time[2]),
          lessThan: time[1] === '<',
        })
      else
        warnings.push({
          code: 'PING_REPLY_FORMAT',
          message: 'Строка ответа не содержит распознанного времени ICMP.',
          range: range(index + 1),
        })
    }
    const stats =
      /(?:Sent|отправлено)\s*=\s*(\d+)\s*,\s*(?:Received|получено)\s*=\s*(\d+)\s*,\s*(?:Lost|потеряно)\s*=\s*(\d+)/i.exec(
        line,
      )
    if (stats) {
      const [sent, received, lost] = [Number(stats[1]), Number(stats[2]), Number(stats[3])]
      if (
        [sent, received, lost].every(Number.isSafeInteger) &&
        sent === received + lost &&
        sent > 0
      ) {
        value.sent = sent
        value.received = received
        value.lost = lost
        value.statsLine = index + 1
      } else
        warnings.push({
          code: 'PING_STATS_INVALID',
          message: 'Счётчики пакетов противоречат друг другу.',
          range: range(index + 1),
        })
    }
    const rtt =
      /(?:Minimum|Минимальное)\s*=\s*(\d+)\s*(?:ms|мс)\s*,\s*(?:Maximum|Максимальное)\s*=\s*(\d+)\s*(?:ms|мс)\s*,\s*(?:Average|Среднее)\s*=\s*(\d+)/i.exec(
        line,
      )
    if (rtt) {
      const [minimum, maximum, average] = [Number(rtt[1]), Number(rtt[2]), Number(rtt[3])]
      if (
        [minimum, maximum, average].every(Number.isSafeInteger) &&
        minimum! <= average! &&
        average! <= maximum!
      ) {
        value.minimum = minimum
        value.maximum = maximum
        value.average = average
      } else
        warnings.push({
          code: 'PING_RTT_INVALID',
          message: 'Показатели RTT противоречат друг другу.',
          range: range(index + 1),
        })
    }
  })
  const recognized = value.replies.length > 0 || value.sent !== undefined
  if (!recognized)
    return {
      kind: 'ping',
      status: 'unsupported',
      warnings: [
        { code: 'PING_UNSUPPORTED', message: 'Не найдены ответы или статистика Windows ping.' },
      ],
    }
  if (value.sent === undefined)
    warnings.push({
      code: 'PING_INCOMPLETE',
      message: 'Статистика пакетов отсутствует. Возможно, вывод обрезан.',
      range: range(lines.length),
    })
  return { kind: 'ping', status: warnings.length ? 'partial' : 'ok', value, warnings }
}
export function parseNslookup(text: string): ParseResult<ParsedNslookup> {
  const { lines, error } = prepare(text, 'nslookup')
  if (error) return invalid('nslookup', error)
  const value: ParsedNslookup = {
    kind: 'nslookup',
    addresses: [],
    outcome: 'unknown',
    eventLines: [],
  }
  const warnings: ParseWarning[] = []
  let section: 'server' | 'answer' | undefined
  let continuation = false
  lines.forEach((line, index) => {
    if (/non-existent domain|NXDOMAIN|несуществующ|не существует/i.test(line)) {
      value.outcome = 'nxdomain'
      value.eventLines.push(index + 1)
    } else if (/server failed|SERVFAIL|сбой сервера/i.test(line)) {
      value.outcome = 'servfail'
      value.eventLines.push(index + 1)
    } else if (/timed out|timeout|превышен интервал|истек срок/i.test(line)) {
      if (value.outcome === 'unknown') value.outcome = 'timeout'
      value.eventLines.push(index + 1)
    }
    const label = /^\s*(Server|Сервер|Name|Имя|Address(?:es)?|Адрес(?:а)?)\s*:\s*(.*)$/i.exec(line)
    if (label) {
      const key = (label[1] ?? '').toLowerCase(),
        content = (label[2] ?? '').trim()
      continuation = false
      if (key === 'server' || key === 'сервер') {
        section = 'server'
        value.serverName = content
      } else if (key === 'name' || key === 'имя') {
        section = 'answer'
        value.queryName = content
      } else {
        continuation = true
        if (isIPAddress(content)) {
          if (section === 'server') value.serverAddress = content
          else if (section === 'answer') {
            value.addresses.push({ value: content, line: index + 1 })
            value.eventLines.push(index + 1)
          }
        } else if (content)
          warnings.push({
            code: 'DNS_ADDRESS_INVALID',
            message: 'Адрес в DNS-выводе не распознан.',
            range: range(index + 1),
          })
      }
      return
    }
    if (continuation && section === 'answer' && isIPAddress(line.trim())) {
      value.addresses.push({ value: line.trim(), line: index + 1 })
      value.eventLines.push(index + 1)
    } else if (line.trim()) continuation = false
  })
  if (value.addresses.length) value.outcome = 'answer'
  if (!value.serverName && !value.eventLines.length)
    return {
      kind: 'nslookup',
      status: 'unsupported',
      warnings: [
        {
          code: 'DNS_UNSUPPORTED',
          message:
            'Нужен неинтерактивный вывод Windows nslookup с Server/Name/Address или ошибкой DNS.',
        },
      ],
    }
  if (value.outcome === 'unknown')
    warnings.push({
      code: 'DNS_INCOMPLETE',
      message: 'Ответ или статус запроса отсутствует.',
      range: range(lines.length),
    })
  return { kind: 'nslookup', status: warnings.length ? 'partial' : 'ok', value, warnings }
}
export function parseTracert(text: string): ParseResult<ParsedTracert> {
  const { lines, error } = prepare(text, 'tracert')
  if (error) return invalid('tracert', error)
  const value: ParsedTracert = { kind: 'tracert', hops: [], completed: false }
  const warnings: ParseWarning[] = []
  lines.forEach((line, index) => {
    const target = /^(?:Tracing route to|Трассировка маршрута к)\s+(.+)/i.exec(line.trim())
    if (target) {
      value.target = target[1]?.trim()
      const bracket = /\[([^\]]+)\]/.exec(target[1] ?? '')
      const address = bracket?.[1] ?? target[1]?.split(/\s/)[0]
      if (address && isIPAddress(address)) value.targetAddress = address
    }
    if (/Trace complete|Трассировка завершена/i.test(line)) value.completed = true
    const hop = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (!hop) return
    let remainder = hop[2] ?? ''
    const times: Array<number | null> = []
    const lessThan: boolean[] = []
    for (let count = 0; count < 3; count++) {
      const match = /^\s*(\*|<?\s*\d+\s*(?:ms|мс))\s*/i.exec(remainder)
      if (!match) break
      times.push(match[1] === '*' ? null : Number(match[1]?.replace(/[^\d]/g, '')))
      lessThan.push(match[1]?.trim().startsWith('<') ?? false)
      remainder = remainder.slice(match[0].length)
    }
    if (times.length !== 3) {
      warnings.push({
        code: 'TRACE_HOP_INVALID',
        message: 'В строке перехода не найдены три результата проб.',
        range: range(index + 1),
      })
      return
    }
    const bracket = /\[([^\]]+)\]/.exec(remainder)
    const address = bracket?.[1] ?? remainder.trim().split(/\s/)[0]
    value.hops.push({
      hop: Number(hop[1]),
      line: index + 1,
      times,
      lessThan,
      address: address && isIPAddress(address) ? address : undefined,
      host: bracket ? remainder.slice(0, remainder.indexOf('[')).trim() : undefined,
    })
  })
  if (!value.hops.length)
    return {
      kind: 'tracert',
      status: 'unsupported',
      warnings: [{ code: 'TRACE_UNSUPPORTED', message: 'Не найдены переходы Windows tracert.' }],
    }
  if (!value.completed)
    warnings.push({
      code: 'TRACE_INCOMPLETE',
      message: 'Нет маркера завершения. Возможно, вывод обрезан или трассировка прервана.',
      range: range(lines.length),
    })
  return { kind: 'tracert', status: warnings.length ? 'partial' : 'ok', value, warnings }
}
export function parseRoutes(text: string): ParseResult<ParsedRoutes> {
  const { lines, error } = prepare(text, 'route')
  if (error) return invalid('route', error)
  const value: ParsedRoutes = { kind: 'route', ipv4Routes: [], ipv6Routes: [] }
  const warnings: ParseWarning[] = []
  let section: 'v4' | 'v6' | undefined
  let persistent = false
  let pending: Omit<ParsedRoutes['ipv6Routes'][number], 'gateway'> | undefined
  lines.forEach((line, index) => {
    if (/IPv4 (?:Route Table|таблица маршрута)|Таблица маршрута IPv4/i.test(line)) {
      section = 'v4'
      persistent = false
      pending = undefined
      return
    }
    if (/IPv6 (?:Route Table|таблица маршрута)|Таблица маршрута IPv6/i.test(line)) {
      section = 'v6'
      persistent = false
      pending = undefined
      return
    }
    if (/Persistent Routes|Постоянные маршруты/i.test(line)) {
      persistent = true
      return
    }
    if (persistent || !section) return
    const parts = line.trim().split(/\s+/)
    if (section === 'v4' && /^\d+\./.test(parts[0] ?? '') && parts.length >= 5) {
      const [destination, mask, gateway, networkInterface, metric] = parts
      const prefix = maskToPrefix(mask ?? '')
      if (
        destination &&
        isIPv4(destination) &&
        prefix !== undefined &&
        gateway &&
        (isIPAddress(gateway) || /^(?:On-link|В)$/i.test(gateway))
      ) {
        const onLink = /^(?:On-link|В)$/i.test(gateway)
        const offset = gateway === 'В' ? 1 : 0
        const iface = parts[3 + offset] ?? networkInterface ?? ''
        const met = Number(parts[4 + offset] ?? metric)
        if (isIPv4(iface) && Number.isSafeInteger(met) && met >= 0)
          value.ipv4Routes.push({
            destination,
            mask: mask!,
            prefix,
            gateway: onLink ? 'on-link' : gateway,
            interface: iface,
            metric: met,
            line: index + 1,
          })
        else
          warnings.push({
            code: 'ROUTE_INVALID',
            message: 'Интерфейс или метрика IPv4-маршрута не распознаны.',
            range: range(index + 1),
          })
      } else
        warnings.push({
          code: 'ROUTE_INVALID',
          message: 'Некорректный IPv4-маршрут исключён.',
          range: range(index + 1),
        })
    } else if (section === 'v6') {
      if (pending) {
        const gateway = line.trim()
        if (isIPv6(gateway) || /^(On-link|В сети)$/i.test(gateway)) {
          value.ipv6Routes.push({
            ...pending,
            gateway: /^(On-link|В сети)$/i.test(gateway) ? 'on-link' : gateway,
          })
          pending = undefined
          return
        }
        warnings.push({
          code: 'ROUTE_V6_INCOMPLETE',
          message: 'Не найден шлюз строки IPv6-маршрута.',
          range: range(pending.line),
        })
        pending = undefined
      }
      const match = /^\s*(\d+)\s+(\d+)\s+([^\s]+)\/(\d+)(?:\s+(.+))?$/.exec(line)
      if (match) {
        const address = match[3] ?? '',
          prefix = Number(match[4]),
          gateway = match[5]?.trim()
        if (!isIPv6(address) || prefix > 128) {
          warnings.push({
            code: 'ROUTE_V6_INVALID',
            message: 'Некорректный IPv6-префикс исключён.',
            range: range(index + 1),
          })
          return
        }
        const entry = {
          destination: address,
          prefix,
          interfaceIndex: Number(match[1]),
          metric: Number(match[2]),
          line: index + 1,
        }
        if (!gateway) pending = entry
        else if (isIPv6(gateway) || /^(On-link|В сети)$/i.test(gateway))
          value.ipv6Routes.push({
            ...entry,
            gateway: /^(On-link|В сети)$/i.test(gateway) ? 'on-link' : gateway,
          })
        else
          warnings.push({
            code: 'ROUTE_V6_INVALID',
            message: 'IPv6-шлюз не распознан.',
            range: range(index + 1),
          })
      }
    }
  })
  if (pending)
    warnings.push({
      code: 'ROUTE_V6_INCOMPLETE',
      message: 'IPv6-маршрут обрезан.',
      range: range(pending.line),
    })
  if (!value.ipv4Routes.length && !value.ipv6Routes.length)
    return {
      kind: 'route',
      status: 'unsupported',
      warnings: [
        ...warnings,
        {
          code: 'ROUTE_UNSUPPORTED',
          message: 'Не найдены активные маршруты стандартного route print на RU/EN.',
        },
      ],
    }
  return { kind: 'route', status: warnings.length ? 'partial' : 'ok', value, warnings }
}
