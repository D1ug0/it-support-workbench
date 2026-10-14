import type { AnalysisResult, EvidenceRange } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { canonicalAddress, isIPAddress } from '../../domain/network'
import { createAddressRedactor } from '../../domain/diagnostics/redact'
import { redactReport } from '../../infrastructure/export/exportReport'

export interface SessionRecord {
  id: string
  label: string
  observedAt: string
  analysis: AnalysisResult<ParsedOutput>
  source: string
}
export interface SessionObservation {
  id: string
  title: string
  explanation: string
  limitation: string
  references: Array<{ recordId: string; range?: EvidenceRange }>
}
export interface DifferenceValue {
  value: string
  address?: boolean
  sensitive?: boolean
  suffix?: string
  details?: { gateway: string; networkInterface: string; metric: number }
}
export interface OutputDifference {
  scope: string
  field: string
  before: DifferenceValue[]
  after: DifferenceValue[]
}

// Preserve the session API while the shared network kernel owns address identity.
export { canonicalAddress } from '../../domain/network'
export function targetAddress(target?: string): string | undefined {
  if (target && /^\[IPv[46] [1-9]\d{0,5}\]$/.test(target)) return target
  const value = /\[([^\]]+)\]/.exec(target ?? '')?.[1] ?? target?.trim()
  return value && isIPAddress(value) ? value : undefined
}
export function analyzeSession(records: SessionRecord[]): SessionObservation[] {
  const chronological = [...records].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  )
  const config = chronological.filter((r) => r.analysis.parse.value?.kind === 'ipconfig').at(-1)
  const lookup = chronological.filter((r) => r.analysis.parse.value?.kind === 'nslookup').at(-1)
  const ping = chronological.filter((r) => r.analysis.parse.value?.kind === 'ping').at(-1)
  const observations: SessionObservation[] = []
  if (
    config?.analysis.parse.value?.kind === 'ipconfig' &&
    lookup?.analysis.parse.value?.kind === 'nslookup'
  ) {
    const dns = config.analysis.parse.value.adapters
      .filter((a) => a.mediaState !== 'disconnected')
      .flatMap((a) => a.dnsServers)
    const server = lookup.analysis.parse.value.serverAddress
    if (server && dns.length) {
      const match = dns.find((d) => canonicalAddress(d.value) === canonicalAddress(server))
      observations.push({
        id: 'SESSION-DNS-001',
        title: match
          ? 'DNS-запрос использует адрес из конфигурации'
          : 'DNS-запрос использует другой адрес сервера',
        explanation: match
          ? 'Адрес сервера nslookup совпадает с одним из DNS активных интерфейсов ipconfig.'
          : 'Адрес сервера nslookup не найден среди DNS активных интерфейсов в выбранном ipconfig.',
        limitation:
          'Это не доказывает причину сбоя: возможны явный выбор сервера, VPN/NRPT, изменение конфигурации и разные моменты проверки.',
        references: [
          {
            recordId: config.id,
            range: match ? { startLine: match.line, endLine: match.line } : undefined,
          },
          { recordId: lookup.id },
        ],
      })
    }
  }
  if (
    lookup?.analysis.parse.value?.kind === 'nslookup' &&
    ping?.analysis.parse.value?.kind === 'ping'
  ) {
    const address = targetAddress(ping.analysis.parse.value.target)
    if (address && lookup.analysis.parse.value.addresses.length) {
      const match = lookup.analysis.parse.value.addresses.find(
        (a) => canonicalAddress(a.value) === canonicalAddress(address),
      )
      observations.push({
        id: 'SESSION-TARGET-001',
        title: match
          ? 'Цель ping присутствует в DNS-ответе'
          : 'Цель ping отличается от адресов DNS-ответа',
        explanation: match
          ? 'Адрес цели ping найден в выбранном DNS-ответе.'
          : 'Проверки могут относиться к разным целям, вариантам ответа или моментам времени.',
        limitation:
          'Сопоставление адресов не подтверждает работу TCP/приложения. Round-robin DNS, CDN и семейства IPv4/IPv6 могут давать разные адреса.',
        references: [
          {
            recordId: lookup.id,
            range: match ? { startLine: match.line, endLine: match.line } : undefined,
          },
          { recordId: ping.id },
        ],
      })
    }
  }
  const typedDns = chronological
    .filter((r) => r.analysis.parse.value?.kind === 'dns-records')
    .at(-1)
  const tcp = chronological
    .filter(
      (r) =>
        r.analysis.parse.value?.kind === 'powershell' &&
        r.analysis.parse.value.cmdlet === 'Test-NetConnection',
    )
    .at(-1)
  if (
    typedDns?.analysis.parse.value?.kind === 'dns-records' &&
    tcp?.analysis.parse.value?.kind === 'powershell' &&
    tcp.analysis.parse.value.cmdlet === 'Test-NetConnection'
  ) {
    const records = typedDns.analysis.parse.value.records.filter(
      (r) => r.type === 'A' || r.type === 'AAAA',
    )
    if (records.length) {
      const match = records.find(
        (r) =>
          r.address &&
          canonicalAddress(r.address) ===
            canonicalAddress(
              tcp.analysis.parse.value!.kind === 'powershell' &&
                tcp.analysis.parse.value!.cmdlet === 'Test-NetConnection'
                ? tcp.analysis.parse.value!.connection.remoteAddress
                : '',
            ),
      )
      observations.push({
        id: 'SESSION-TCP-DNS-001',
        title: match
          ? 'TCP-цель присутствует в типизированном DNS-ответе'
          : 'TCP-цель отличается от типизированного DNS-ответа',
        explanation: match
          ? 'Адрес Test-NetConnection найден среди записей A/AAAA выбранного DNS-ответа.'
          : 'В записях A/AAAA выбранного ответа не найден адрес TCP-цели.',
        limitation:
          'Разные запросы, секции ответа, семейства адресов, CDN и время измерений могут менять результат. Сопоставление не проверяет TLS/HTTP и не устанавливает причину.',
        references: [
          {
            recordId: typedDns.id,
            range: match ? { startLine: match.line, endLine: match.line } : undefined,
          },
          { recordId: tcp.id },
        ],
      })
    }
  }
  if (
    chronological.length > 1 &&
    Date.parse(chronological.at(-1)!.observedAt) - Date.parse(chronological[0]!.observedAt) >
      30 * 60 * 1000
  )
    observations.push({
      id: 'SESSION-TIME-001',
      title: 'Проверки разделены более чем 30 минутами',
      explanation: 'Конфигурация и состояние сервиса могли измениться между измерениями.',
      limitation: '30 минут — ориентир для внимания, а не техническая граница достоверности.',
      references: [{ recordId: chronological[0]!.id }, { recordId: chronological.at(-1)!.id }],
    })
  return observations
}
const plain = (value: unknown): DifferenceValue[] => [
  { value: value === undefined ? 'Не определено' : String(value) },
]
const ips = (values: string[]): DifferenceValue[] =>
  values.map((value) => ({ value: canonicalAddress(value), address: true }))
export function compareOutputs(before: ParsedOutput, after: ParsedOutput): OutputDifference[] {
  if (before.kind !== after.kind)
    throw new Error('Для сравнения выберите два вывода одной команды.')
  const differences: OutputDifference[] = []
  const add = (scope: string, field: string, a: DifferenceValue[], b: DifferenceValue[]) => {
    const sort = (items: DifferenceValue[]) =>
      [...items].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
    const left = sort(a),
      right = sort(b)
    if (JSON.stringify(left) !== JSON.stringify(right))
      differences.push({ scope, field, before: left, after: right })
  }
  if (before.kind === 'ipconfig' && after.kind === 'ipconfig') {
    const names = new Set([...before.adapters, ...after.adapters].map((a) => a.displayName))
    for (const name of names) {
      const a = before.adapters.filter((adapter) => adapter.displayName === name)
      const b = after.adapters.filter((adapter) => adapter.displayName === name)
      if (a.length !== 1 || b.length !== 1) {
        add(name, 'Количество интерфейсов с этим именем', plain(a.length), plain(b.length))
        if (a.length > 1 || b.length > 1)
          differences.push({
            scope: name,
            field: 'Неоднозначное имя — поля не сопоставлены',
            before: plain(a.length),
            after: plain(b.length),
          })
        continue
      }
      add(name, 'Состояние интерфейса', plain(a[0]!.mediaState), plain(b[0]!.mediaState))
      add(name, 'DHCP', plain(a[0]!.dhcpEnabled), plain(b[0]!.dhcpEnabled))
      add(
        name,
        'MAC',
        [{ value: a[0]!.macAddress ?? 'Не определено', sensitive: true }],
        [{ value: b[0]!.macAddress ?? 'Не определено', sensitive: true }],
      )
      const v4 = (item: (typeof a)[number]) =>
        item.ipv4.map((ip) => ({
          value: canonicalAddress(ip.address),
          address: true,
          suffix: ip.prefixLength === undefined ? '/?' : `/${ip.prefixLength}`,
        }))
      add(name, 'IPv4 / префикс', v4(a[0]!), v4(b[0]!))
      add(
        name,
        'IPv6',
        ips(a[0]!.ipv6.map((ip) => ip.address)),
        ips(b[0]!.ipv6.map((ip) => ip.address)),
      )
      for (const [field, label] of [
        ['dnsServers', 'DNS'],
        ['gateways', 'Шлюзы'],
      ] as const)
        add(
          name,
          label,
          ips(a[0]![field].map((v) => v.value)),
          ips(b[0]![field].map((v) => v.value)),
        )
    }
  } else if (before.kind === 'ping' && after.kind === 'ping') {
    for (const [field, label] of [
      ['sent', 'Отправлено'],
      ['received', 'Получено'],
      ['lost', 'Потеряно'],
      ['minimum', 'Минимальный RTT, ms'],
      ['maximum', 'Максимальный RTT, ms'],
      ['average', 'Средний RTT, ms'],
    ] as const)
      add('ICMP', label, plain(before[field]), plain(after[field]))
    add(
      'ICMP',
      'Цель запроса',
      [{ value: before.target ?? 'Не определено', sensitive: true }],
      [{ value: after.target ?? 'Не определено', sensitive: true }],
    )
    for (const outcome of ['reply', 'timeout', 'unreachable'] as const)
      add(
        'ICMP',
        `Ответы ${outcome}`,
        plain(before.replies.filter((r) => r.outcome === outcome).length),
        plain(after.replies.filter((r) => r.outcome === outcome).length),
      )
    add(
      'ICMP',
      'Цель',
      ips([targetAddress(before.target) ?? ''].filter(Boolean)),
      ips([targetAddress(after.target) ?? ''].filter(Boolean)),
    )
  } else if (before.kind === 'nslookup' && after.kind === 'nslookup') {
    add(
      'DNS',
      'Имя запроса',
      [{ value: before.queryName ?? 'Не определено', sensitive: true }],
      [{ value: after.queryName ?? 'Не определено', sensitive: true }],
    )
    add('DNS', 'Результат', plain(before.outcome), plain(after.outcome))
    add(
      'DNS',
      'Сервер',
      ips(before.serverAddress ? [before.serverAddress] : []),
      ips(after.serverAddress ? [after.serverAddress] : []),
    )
    add(
      'DNS',
      'Ответы',
      ips(before.addresses.map((a) => a.value)),
      ips(after.addresses.map((a) => a.value)),
    )
  } else if (before.kind === 'tracert' && after.kind === 'tracert') {
    add(
      'Трассировка',
      'Цель запроса',
      [{ value: before.target ?? 'Не определено', sensitive: true }],
      [{ value: after.target ?? 'Не определено', sensitive: true }],
    )
    add(
      'Трассировка',
      'Адрес цели',
      ips(before.targetAddress ? [before.targetAddress] : []),
      ips(after.targetAddress ? [after.targetAddress] : []),
    )
    add('Трассировка', 'Число хопов', plain(before.hops.length), plain(after.hops.length))
    add('Трассировка', 'Маркер завершения', plain(before.completed), plain(after.completed))
    add(
      'Трассировка',
      'Адреса отвечающих хопов',
      before.hops.flatMap((h) =>
        h.address
          ? [{ value: canonicalAddress(h.address), address: true, suffix: ` · хоп ${h.hop}` }]
          : [],
      ),
      after.hops.flatMap((h) =>
        h.address
          ? [{ value: canonicalAddress(h.address), address: true, suffix: ` · хоп ${h.hop}` }]
          : [],
      ),
    )
    const timings = (hops: typeof before.hops): DifferenceValue[] =>
      hops.map((hop) => ({
        value: hop.times
          .map((time, index) =>
            time === null ? '*' : `${hop.lessThan[index] ? '<' : ''}${time} ms`,
          )
          .join(' / '),
        suffix: ` · хоп ${hop.hop}`,
      }))
    add(
      'Трассировка',
      'RTT и отсутствие ответов по хопам',
      timings(before.hops),
      timings(after.hops),
    )
  } else if (before.kind === 'dns-records' && after.kind === 'dns-records') {
    const records = (items: typeof before.records): DifferenceValue[] =>
      items.map((r) => ({
        value: JSON.stringify([
          r.type,
          r.name.toLowerCase().replace(/\.$/, ''),
          r.target?.toLowerCase().replace(/\.$/, ''),
          r.address ? canonicalAddress(r.address) : undefined,
          r.text,
          r.preference,
          r.priority,
          r.weight,
          r.port,
          r.ttl,
          r.section,
        ]),
        sensitive: true,
      }))
    add(
      'DNS',
      'Записи и связанные параметры (имена скрыты)',
      records(before.records),
      records(after.records),
    )
    for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] as const)
      add(
        'DNS',
        `Число записей ${type}`,
        plain(before.records.filter((r) => r.type === type).length),
        plain(after.records.filter((r) => r.type === type).length),
      )
  } else if (before.kind === 'powershell' && after.kind === 'powershell') {
    add('PowerShell', 'Команда', plain(before.cmdlet), plain(after.cmdlet))
    if (before.cmdlet === 'Test-NetConnection' && after.cmdlet === 'Test-NetConnection') {
      const a = before.connection,
        b = after.connection
      add('TCP', 'TCP-проверка', plain(a.tcpSucceeded), plain(b.tcpSucceeded))
      add('TCP', 'Порт', plain(a.remotePort), plain(b.remotePort))
      add('TCP', 'Целевой адрес', ips([a.remoteAddress]), ips([b.remoteAddress]))
      add(
        'TCP',
        'Исходный адрес',
        ips(a.sourceAddress ? [a.sourceAddress] : []),
        ips(b.sourceAddress ? [b.sourceAddress] : []),
      )
    } else if (
      before.cmdlet === 'Get-NetIPConfiguration' &&
      after.cmdlet === 'Get-NetIPConfiguration'
    ) {
      const interfaces = (items: typeof before.interfaces): DifferenceValue[] =>
        items.map((v) => ({
          value: JSON.stringify([
            v.index,
            v.alias,
            ...[v.ipv4, v.ipv6, v.gateways, v.dns].map((addresses) =>
              addresses.map(canonicalAddress).sort(),
            ),
          ]),
          sensitive: true,
        }))
      add(
        'IP',
        'Количество интерфейсов',
        plain(before.interfaces.length),
        plain(after.interfaces.length),
      )
      add(
        'IP',
        'Интерфейсы и связанные адреса (имена скрыты)',
        interfaces(before.interfaces),
        interfaces(after.interfaces),
      )
    }
  } else if (before.kind === 'route' && after.kind === 'route') {
    for (const [field, label] of [
      ['ipv4Routes', 'IPv4'],
      ['ipv6Routes', 'IPv6'],
    ] as const) {
      const routes = (items: (typeof before)[typeof field]): DifferenceValue[] =>
        items.map((r) => ({
          value: canonicalAddress(r.destination),
          address: true,
          suffix: `/${r.prefix}`,
          details: {
            gateway: canonicalAddress(r.gateway),
            networkInterface: canonicalAddress(
              'interface' in r ? r.interface : String(r.interfaceIndex),
            ),
            metric: r.metric,
          },
        }))
      add(label, 'Маршруты и их параметры', routes(before[field]), routes(after[field]))
    }
  }
  return differences
}
export function formatDifference(
  values: DifferenceValue[],
  redact = createAddressRedactor(),
  revealed = false,
): string {
  const address = (value: string) => (!revealed && isIPAddress(value) ? redact(value) : value)
  return values.length
    ? values
        .map(
          (item) =>
            (item.sensitive && !revealed
              ? 'Скрыто'
              : item.address && !revealed && item.value !== 'on-link'
                ? redact(item.value)
                : item.value) +
            (item.suffix ?? '') +
            (item.details
              ? ` → ${address(item.details.gateway)} · if ${address(item.details.networkInterface)} · metric ${item.details.metric}`
              : ''),
        )
        .join(', ')
    : 'Отсутствует'
}
export function exportSession(
  records: SessionRecord[],
  observations: SessionObservation[],
  differences: OutputDifference[] = [],
  comparison?: { beforeId: string; afterId: string },
): string {
  const redact = createAddressRedactor()
  const beforeIndex = records.findIndex((r) => r.id === comparison?.beforeId)
  const afterIndex = records.findIndex((r) => r.id === comparison?.afterId)
  if (comparison && (beforeIndex < 0 || afterIndex < 0 || beforeIndex === afterIndex))
    throw new Error('Не найдены две разные проверки для отчёта сравнения.')
  return [
    '# IT Support Workbench — рабочая сессия',
    'Контекст и принадлежность проверок подтверждены пользователем. Имена, названия и исходники исключены.',
    ...observations.flatMap((o) => [
      `## ${o.id} — ${o.title}`,
      o.explanation,
      `Ограничение: ${o.limitation}`,
      `Проверки: ${o.references.map((ref) => records.findIndex((r) => r.id === ref.recordId) + 1).join(', ')}`,
    ]),
    '## Различия выбранных проверок',
    comparison
      ? `До: проверка ${beforeIndex + 1}. После: проверка ${afterIndex + 1}.`
      : 'Пара проверок для сравнения не указана.',
    ...differences.map(
      (d, i) =>
        `- ${i + 1}. ${d.field}: ${formatDifference(d.before, redact)} → ${formatDifference(d.after, redact)}`,
    ),
    ...records.flatMap((record, index) => [
      `## Проверка ${index + 1} · ${record.observedAt}`,
      redactReport(record.analysis, redact),
    ]),
    'Сопоставление не устанавливает причинно-следственную связь. Состояние отражено только в предоставленных выводах.',
  ].join('\n\n')
}
