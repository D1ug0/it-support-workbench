import type { Adapter, ParsedIpconfig } from '../../domain/types/network'
import type { ParseResult, ParseWarning } from '../../domain/types/diagnostic'
import { cleanAddress, isIPv4, isIPv6, isIPAddress, maskToPrefix } from '../../domain/network'
import { normalizeInput, validateInput } from './normalizeInput'

const fieldMatchers: Array<[string, RegExp]> = [
  ['computerName', /^(Host Name|Имя (?:компьютера|узла))$/i],
  ['description', /^(Description|Описание)$/i],
  ['dnsSuffix', /^(Connection-specific DNS Suffix|DNS-суффикс подключения)$/i],
  ['macAddress', /^(Physical Address|Физический адрес)$/i],
  ['dhcpEnabled', /^(DHCP Enabled|DHCP включ[её]н)$/i],
  [
    'ipv4',
    /^(IPv4 Address|IPv4-адрес|IP Address|IP-адрес|Autoconfiguration IPv4 Address|IPv4-адрес автонастройки|Адрес IPv4 автоконфигурации)$/i,
  ],
  [
    'ipv6',
    /^(IPv6 Address|IPv6-адрес|Temporary IPv6 Address|Временный IPv6-адрес|Link-local IPv6 Address|Локальный IPv6-адрес канала|Локальный адрес IPv6 канала)$/i,
  ],
  ['mask', /^(Subnet Mask|Маска подсети)$/i],
  ['gateways', /^(Default Gateway|Основной шлюз)$/i],
  ['dnsServers', /^(DNS Servers|DNS-серверы)$/i],
  ['dhcpServer', /^(DHCP Server|DHCP-сервер)$/i],
  ['mediaState', /^(Media State|Состояние среды|Состояние среды передачи)$/i],
]
const ignoredFields =
  /^(Primary DNS Suffix|Node Type|IP Routing Enabled|WINS Proxy Enabled|NetBIOS over Tcpip|Lease Obtained|Lease Expires|DHCPv6 IAID|DHCPv6 Client DUID|Autoconfiguration Enabled|Primary WINS Server|Secondary WINS Server|Основной DNS-суффикс|Тип узла|IP-маршрутизация включена|WINS-прокси включен|NetBIOS через TCP\/IP|Аренда получена|Срок аренды истекает|Аренда истекает|Автонастройка включена|IAID DHCPv6|DUID клиента DHCPv6)$/i

export function adapterHeader(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed.endsWith(':')) return undefined
  const en = /^(?:[^:]*?\badapter)\s+(.+):$/i.exec(trimmed)
  const ru = /^(?:Адаптер|Туннельный адаптер)\s+(.+):$/i.exec(trimmed)
  return (en?.[1] ?? ru?.[1])?.trim()
}

export function parseIpconfig(text: string): ParseResult<ParsedIpconfig> {
  const normalized = normalizeInput(text)
  const error = validateInput(normalized)
  if (error)
    return {
      status: 'invalid',
      kind: 'ipconfig',
      warnings: [{ code: 'INPUT_INVALID', message: error }],
    }
  const lines = normalized.split('\n')
  const warnings: ParseWarning[] = []
  const model: ParsedIpconfig = { kind: 'ipconfig', adapters: [] }
  let current: Adapter | undefined
  let continuation: 'dnsServers' | 'gateways' | undefined
  let knownFields = 0
  const warn = (code: string, message: string, line: number) =>
    warnings.push({ code, message, range: { startLine: line, endLine: line } })
  const addressList = (field: 'dnsServers' | 'gateways', value: string, line: number) => {
    if (!current || !value) return
    const address = cleanAddress(value)
    if (isIPAddress(address)) current[field].push({ value: address, line })
    else warn('INVALID_ADDRESS', 'Адрес в строке не распознан. Проверьте исходный текст.', line)
  }
  lines.forEach((line, index) => {
    const number = index + 1
    const name = adapterHeader(line)
    if (name) {
      if (current) current.sourceRange.endLine = Math.max(current.sourceRange.startLine, number - 1)
      current = {
        id: `adapter-${model.adapters.length + 1}`,
        displayName: name,
        mediaState: 'unknown',
        ipv4: [],
        ipv6: [],
        gateways: [],
        dnsServers: [],
        invalidMasks: [],
        fieldLines: { header: [number] },
        sourceRange: { startLine: number, endLine: lines.length },
      }
      model.adapters.push(current)
      continuation = undefined
      return
    }
    if (!line.trim()) return
    if (continuation && isIPAddress(cleanAddress(line.trim()))) {
      addressList(continuation, line.trim(), number)
      if (current) (current.fieldLines[continuation] ??= []).push(number)
      return
    }
    continuation = undefined
    const match = /^\s+(.+?)\s*:\s*(.*)$/.exec(line)
    if (!match) {
      if (current)
        warn('UNKNOWN_LINE', 'Строка не распознана. Она оставлена в исходном тексте.', number)
      return
    }
    const label = (match[1] ?? '').replace(/\./g, '').replace(/\s+/g, ' ').trim()
    const value = (match[2] ?? '').trim()
    const field = fieldMatchers.find(([, pattern]) => pattern.test(label))?.[0]
    if (!field) {
      if (!ignoredFields.test(label))
        warn(
          'UNKNOWN_FIELD',
          'Дополнительное поле не интерпретируется этой версией парсера.',
          number,
        )
      return
    }
    knownFields++
    if (field === 'computerName') {
      model.computerName = value || undefined
      return
    }
    if (!current) return
    ;(current.fieldLines[field] ??= []).push(number)
    if (field === 'dnsServers' || field === 'gateways') {
      continuation = field
      addressList(field, value, number)
    } else if (field === 'ipv4') {
      const address = cleanAddress(value)
      if (isIPv4(address)) current.ipv4.push({ address, line: number })
      else warn('INVALID_IPV4', 'IPv4-адрес некорректен и не включён в результат.', number)
    } else if (field === 'ipv6') {
      const address = cleanAddress(value)
      if (isIPv6(address)) current.ipv6.push({ address, line: number })
      else warn('INVALID_IPV6', 'IPv6-адрес некорректен и не включён в результат.', number)
    } else if (field === 'mask') {
      const prefix = maskToPrefix(value)
      const last = current.ipv4.at(-1)
      if (prefix === undefined) {
        current.invalidMasks.push({ value, line: number })
        warn('INVALID_MASK', 'Маска не является непрерывной IPv4-маской.', number)
      } else if (last) {
        last.mask = value
        last.prefixLength = prefix
        last.maskLine = number
      } else warn('ORPHAN_MASK', 'Маска обнаружена без предшествующего IPv4-адреса.', number)
    } else if (field === 'dhcpEnabled') {
      if (/^(Yes|Да)$/i.test(value)) current.dhcpEnabled = true
      else if (/^(No|Нет)$/i.test(value)) current.dhcpEnabled = false
      else warn('UNKNOWN_DHCP', 'Состояние DHCP не распознано.', number)
    } else if (field === 'mediaState') {
      current.mediaState = /disconnected|недоступна|отключен|отключён/i.test(value)
        ? 'disconnected'
        : 'unknown'
    } else if (field === 'dhcpServer') {
      if (isIPAddress(value)) current.dhcpServer = value
      else if (value) warn('INVALID_DHCP_SERVER', 'Адрес DHCP-сервера не распознан.', number)
    } else if (field === 'macAddress') {
      if (/^(?:[\da-f]{2}[-:]){5}[\da-f]{2}$/i.test(value)) current.macAddress = value
      else if (value) warn('INVALID_MAC', 'Физический адрес не распознан.', number)
    } else if (field === 'description') current.description = value || undefined
    else if (field === 'dnsSuffix') current.dnsSuffix = value || undefined
  })
  if (!model.adapters.length) {
    return {
      status: knownFields ? 'partial' : 'unsupported',
      kind: 'ipconfig',
      value: knownFields ? model : undefined,
      warnings: [
        ...warnings,
        {
          code: 'NO_ADAPTERS',
          message:
            'Секции адаптеров не найдены. Нужен полный вывод ipconfig /all на русском или английском.',
          range: { startLine: 1, endLine: Math.min(lines.length, 3) },
        },
      ],
    }
  }
  for (const adapter of model.adapters) {
    if (adapter.mediaState !== 'disconnected' && (adapter.ipv4.length || adapter.ipv6.length))
      adapter.mediaState = 'connected'
    if (adapter.mediaState === 'unknown')
      warn(
        'INCOMPLETE_ADAPTER',
        'У адаптера не найдены адреса или явный статус отключения. Возможно, вывод обрезан.',
        adapter.sourceRange.startLine,
      )
    if (adapter.ipv4.some((ip) => ip.mask === undefined))
      warn(
        'MISSING_MASK',
        'Для IPv4-адреса не найдена корректная маска.',
        adapter.ipv4[0]?.line ?? adapter.sourceRange.startLine,
      )
  }
  return { status: warnings.length ? 'partial' : 'ok', kind: 'ipconfig', value: model, warnings }
}
