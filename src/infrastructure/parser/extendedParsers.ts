import type { ParseResult, ParseWarning } from '../../domain/types/diagnostic'
import type { ParsedDnsRecords, ParsedPowerShell, DnsRecord } from '../../domain/types/outputs'
import { isIPAddress, isIPv4, isIPv6 } from '../../domain/network'
import { normalizeInput, validateInput } from './normalizeInput'
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const integer = (v: unknown, max = 65535): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max
const name = (v: unknown): v is string => typeof v === 'string' && /^[a-z\d_.-]{1,255}$/i.test(v)
const address = (v: unknown): string | undefined => {
  const value = object(v) ? (v.IPAddressToString ?? v.IPAddress ?? v.NextHop) : v
  return typeof value === 'string' && isIPAddress(value) ? value : undefined
}
const addresses = (v: unknown): string[] | undefined => {
  if (v === undefined || v === null) return []
  const values = Array.isArray(v) ? v : [v]
  if (values.length > 256) return undefined
  const valid = values.map(address)
  return valid.every((v): v is string => v !== undefined) ? valid : undefined
}
const invalid = <T>(kind: 'dns-records' | 'powershell', message: string): ParseResult<T> => ({
  kind,
  status: 'invalid',
  warnings: [{ code: 'EXT_INVALID', message }],
})
// Top-level JSON object ranges retain physical source lines, including nested address objects.
function jsonRows(text: string) {
  const decoded: unknown = JSON.parse(text)
  const rows = Array.isArray(decoded) ? decoded : [decoded]
  if (rows.length === 0 || rows.length > 2000 || !rows.every(object))
    throw new Error('Нужны 1–2000 JSON-объектов одной поддерживаемой команды.')
  const positions: number[] = []
  let depth = 0,
    line = 1,
    quoted = false,
    escaped = false
  for (const char of text) {
    if (char === '\n') line++
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '{') {
      if (depth === 0) positions.push(line)
      depth++
    } else if (char === '}') depth--
  }
  return rows.map((row, index) => ({ row, line: positions[index] ?? 1 }))
}
const typeNames: Record<string, DnsRecord['type']> = {
  1: 'A',
  28: 'AAAA',
  5: 'CNAME',
  15: 'MX',
  16: 'TXT',
  33: 'SRV',
  A: 'A',
  AAAA: 'AAAA',
  CNAME: 'CNAME',
  MX: 'MX',
  TXT: 'TXT',
  SRV: 'SRV',
}
function dnsJsonRecord(row: Record<string, unknown>, line: number): DnsRecord | undefined {
  const type = typeNames[String(row.Type).toUpperCase()]
  if (!type || !name(row.Name)) return undefined
  const record: DnsRecord = { type, name: row.Name, line }
  if (row.TTL !== undefined && row.TTL !== null) {
    if (!integer(row.TTL, 4294967295)) return undefined
    record.ttl = row.TTL
  }
  const sections: Record<string, NonNullable<DnsRecord['section']>> = {
    1: 'answer',
    2: 'authority',
    3: 'additional',
    ANSWER: 'answer',
    AUTHORITY: 'authority',
    ADDITIONAL: 'additional',
  }
  if (row.Section !== undefined && row.Section !== null) {
    const section = sections[String(row.Section).toUpperCase()]
    if (!section) return undefined
    record.section = section
  }
  if (type === 'A' || type === 'AAAA') {
    const ip = address(row.IPAddress)
    if (!ip || !(type === 'A' ? isIPv4(ip) : isIPv6(ip))) return undefined
    record.address = ip
  } else if (type === 'TXT') {
    const strings = Array.isArray(row.Strings) ? row.Strings : [row.Strings]
    if (
      !strings.length ||
      strings.length > 64 ||
      !strings.every((v): v is string => typeof v === 'string' && v.length <= 4096) ||
      strings.join('').length > 8192
    )
      return undefined
    record.text = strings
  } else if (type === 'MX') {
    if (!name(row.NameExchange) || !integer(row.Preference)) return undefined
    record.target = row.NameExchange
    record.preference = row.Preference
  } else if (type === 'SRV') {
    if (
      !name(row.NameTarget) ||
      !integer(row.Priority) ||
      !integer(row.Weight) ||
      !integer(row.Port)
    )
      return undefined
    record.target = row.NameTarget
    record.priority = row.Priority
    record.weight = row.Weight
    record.port = row.Port
  } else {
    if (!name(row.NameHost)) return undefined
    record.target = row.NameHost
  }
  return record
}
export function parseDnsRecords(raw: string): ParseResult<ParsedDnsRecords> {
  const text = normalizeInput(raw),
    error = validateInput(text)
  if (error) return invalid('dns-records', error)
  const warnings: ParseWarning[] = []
  const records: DnsRecord[] = []
  const format =
    text.trim().startsWith('{') || text.trim().startsWith('[') ? 'powershell-json' : 'nslookup'
  if (format === 'powershell-json') {
    try {
      for (const { row, line } of jsonRows(text)) {
        const record = dnsJsonRecord(row, line)
        if (record) records.push(record)
        else
          warnings.push({
            code: 'DNS_RECORD_INVALID',
            message: 'JSON-запись имеет неподдерживаемый тип или неполные/неверные поля.',
            range: { startLine: line, endLine: line },
          })
      }
    } catch {
      return invalid(
        'dns-records',
        'Нужен корректный JSON из Resolve-DnsName с выбранными полями; таблицы и Format-List здесь не поддерживаются.',
      )
    }
  } else {
    const lines = text.split('\n')
    let srv: Partial<DnsRecord> | undefined, txt: DnsRecord | undefined
    const flush = () => {
      if (srv) {
        if (
          name(srv.name) &&
          srv.line &&
          srv.target &&
          integer(srv.priority) &&
          integer(srv.weight) &&
          integer(srv.port)
        )
          records.push(srv as DnsRecord)
        else
          warnings.push({
            code: 'DNS_SRV_INCOMPLETE',
            message: 'SRV-блок неполный; запись не используется.',
            range: { startLine: srv.line ?? 1, endLine: srv.line ?? 1 },
          })
        srv = undefined
      }
    }
    lines.forEach((line, index) => {
      const mx =
        /^\s*(\S+)\s+(?:MX preference|предпочтение MX)\s*=\s*(\d+)\s*,\s*(?:mail exchanger|почтовый сервер|обменник почты)\s*=\s*(\S+)\s*$/i.exec(
          line,
        )
      if (mx) {
        flush()
        txt = undefined
        if (name(mx[1]) && name(mx[3]) && integer(Number(mx[2])))
          records.push({
            type: 'MX',
            name: mx[1],
            preference: Number(mx[2]),
            target: mx[3],
            line: index + 1,
          })
        else
          warnings.push({
            code: 'DNS_MX_INVALID',
            message: 'MX preference/target некорректны.',
            range: { startLine: index + 1, endLine: index + 1 },
          })
        return
      }
      const start = /^\s*(\S+)\s+(?:SRV service location|расположение службы SRV)\s*:\s*$/i.exec(
        line,
      )
      if (start) {
        flush()
        txt = undefined
        srv = { type: 'SRV', name: start[1], line: index + 1 }
        return
      }
      const field =
        /^\s*(priority|weight|port|svr hostname|приоритет|вес|порт|имя сервера)\s*=\s*(\S+)\s*$/i.exec(
          line,
        )
      if (srv && field) {
        const keys: Record<string, 'priority' | 'weight' | 'port' | 'target'> = {
          priority: 'priority',
          weight: 'weight',
          port: 'port',
          'svr hostname': 'target',
          приоритет: 'priority',
          вес: 'weight',
          порт: 'port',
          'имя сервера': 'target',
        }
        const key = keys[field[1]!.toLowerCase()]!
        if (key === 'target') {
          if (name(field[2])) srv.target = field[2]
        } else srv[key] = Number(field[2])
        return
      }
      const textStart = /^\s*(\S+)\s+(?:text|текст)\s*=\s*(.*)$/i.exec(line)
      if (textStart) {
        flush()
        txt = undefined
        if (name(textStart[1])) {
          txt = { type: 'TXT', name: textStart[1], text: [], line: index + 1 }
          records.push(txt)
        }
      }
      const segments = (textStart?.[2] ?? line).match(/"[^"\r\n]*"/g)
      if (txt && segments && /^(?:\s*"[^"\r\n]*"\s*)+$/.test(textStart?.[2] || line))
        txt.text!.push(...segments.map((s) => s.slice(1, -1)))
      else if (!textStart && line.trim()) {
        flush()
        txt = undefined
      }
    })
    flush()
    for (let i = records.length - 1; i >= 0; i--)
      if (
        records[i]!.type === 'TXT' &&
        (!records[i]!.text?.length ||
          records[i]!.text!.length > 64 ||
          records[i]!.text!.join('').length > 8192)
      ) {
        warnings.push({
          code: 'DNS_TXT_INCOMPLETE',
          message: 'TXT-блок неполный или превышает лимит текста.',
        })
        records.splice(i, 1)
      }
  }
  if (records.length > 2000)
    return invalid('dns-records', 'Лимит: 2000 DNS-записей. Вставьте меньший фрагмент.')
  if (!records.length)
    return {
      kind: 'dns-records',
      status: 'unsupported',
      warnings: [
        ...warnings,
        {
          code: 'DNS_RECORDS_UNSUPPORTED',
          message:
            'Не найдены полные MX/TXT/SRV-блоки nslookup или поддерживаемые JSON-записи Resolve-DnsName.',
        },
      ],
    }
  return {
    kind: 'dns-records',
    status: warnings.length ? 'partial' : 'ok',
    value: { kind: 'dns-records', format, records },
    warnings,
  }
}
export function parsePowerShell(raw: string): ParseResult<ParsedPowerShell> {
  const text = normalizeInput(raw),
    error = validateInput(text)
  if (error) return invalid('powershell', error)
  try {
    const rows = jsonRows(text)
    if (rows.some(({ row }) => Object.hasOwn(row, 'TcpTestSucceeded'))) {
      if (rows.length !== 1) return invalid('powershell', 'Вставьте результат одной TCP-проверки.')
      const { row, line } = rows[0]!,
        remoteAddress = address(row.RemoteAddress),
        sourceAddress = address(row.SourceAddress)
      if (
        !remoteAddress ||
        !integer(row.RemotePort) ||
        row.RemotePort === 0 ||
        typeof row.TcpTestSucceeded !== 'boolean' ||
        (row.SourceAddress !== undefined && !sourceAddress)
      )
        return invalid(
          'powershell',
          'TCP-проверка требует RemoteAddress, RemotePort и boolean TcpTestSucceeded; строки True/False не заменяют JSON boolean.',
        )
      if (
        row.ComputerName !== undefined &&
        !name(row.ComputerName) &&
        !(typeof row.ComputerName === 'string' && isIPAddress(row.ComputerName))
      )
        return invalid('powershell', 'ComputerName имеет неподдерживаемый формат.')
      return {
        kind: 'powershell',
        status: 'ok',
        warnings: [],
        value: {
          kind: 'powershell',
          cmdlet: 'Test-NetConnection',
          connection: {
            remoteAddress,
            remotePort: row.RemotePort,
            tcpSucceeded: row.TcpTestSucceeded,
            sourceAddress,
            computerName: typeof row.ComputerName === 'string' ? row.ComputerName : undefined,
            interfaceAlias:
              typeof row.InterfaceAlias === 'string' ? row.InterfaceAlias.slice(0, 100) : undefined,
            line,
          },
        },
      }
    }
    const interfaces: Extract<
      ParsedPowerShell,
      { cmdlet: 'Get-NetIPConfiguration' }
    >['interfaces'] = []
    const warnings: ParseWarning[] = []
    for (const { row, line } of rows) {
      const ipv4 = addresses(row.IPv4Address),
        ipv6 = addresses(row.IPv6Address),
        gateways = addresses(row.IPv4DefaultGateway)
      const dnsRaw = Array.isArray(row.DNSServer)
        ? row.DNSServer.flatMap((v) => (object(v) ? (v.ServerAddresses ?? v) : v))
        : object(row.DNSServer)
          ? row.DNSServer.ServerAddresses
          : row.DNSServer
      const dns = addresses(dnsRaw)
      if (
        !integer(row.InterfaceIndex, 4294967295) ||
        typeof row.InterfaceAlias !== 'string' ||
        !row.InterfaceAlias.trim() ||
        row.InterfaceAlias.length > 100 ||
        !ipv4 ||
        !ipv6 ||
        !gateways ||
        !dns ||
        !ipv4.every(isIPv4) ||
        !ipv6.every(isIPv6) ||
        !Object.hasOwn(row, 'IPv4Address')
      ) {
        warnings.push({
          code: 'PS_INTERFACE_INVALID',
          message: 'Интерфейс пропущен: нужны InterfaceIndex, InterfaceAlias и валидные адреса.',
          range: { startLine: line, endLine: line },
        })
        continue
      }
      interfaces.push({
        index: row.InterfaceIndex,
        alias: row.InterfaceAlias,
        ipv4,
        ipv6,
        gateways,
        dns,
        line,
      })
    }
    if (!interfaces.length)
      return {
        kind: 'powershell',
        status: 'unsupported',
        warnings: [
          ...warnings,
          {
            code: 'PS_UNSUPPORTED',
            message:
              'Поддерживается JSON Test-NetConnection или выбранных полей Get-NetIPConfiguration. Используйте пример команды экспорта.',
          },
        ],
      }
    return {
      kind: 'powershell',
      status: warnings.length ? 'partial' : 'ok',
      warnings,
      value: { kind: 'powershell', cmdlet: 'Get-NetIPConfiguration', interfaces },
    }
  } catch {
    return invalid(
      'powershell',
      'JSON некорректен. Экспортируйте через ConvertTo-Json; Format-Table и Format-List не поддерживаются.',
    )
  }
}
