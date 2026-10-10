import type { AnalysisResult } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { createAddressRedactor } from './redact'

export function redactReport(
  result: AnalysisResult<ParsedOutput>,
  redact = createAddressRedactor(),
): string {
  const output = result.parse.value
  const adapters = output?.kind === 'ipconfig' ? output.adapters : []
  const content = [
    '# IT Support Workbench — диагностический отчёт',
    '',
    `Создан: ${result.createdAt}`,
    'Версия формата: 1',
    `Версия парсера: ${result.parserVersion}`,
    `Тип ввода: ${result.parse.kind}`,
    'Обработка: локально в браузере',
    'Идентификаторы: скрыты; документационные адреса сохранены',
    '',
    '## Сводка',
    `- Адаптеров: ${adapters.length}`,
    `- С назначенными адресами: ${adapters.filter((a) => a.mediaState === 'connected').length}`,
    `- Наблюдений: ${result.findings.length}`,
    `- Статус разбора: ${result.parse.status}`,
    '',
    '## Адаптеры',
  ]
  for (const [index, adapter] of adapters.entries()) {
    content.push(
      `### Адаптер ${index + 1}`,
      `- Состояние: ${adapter.mediaState}`,
      `- DHCP: ${adapter.dhcpEnabled === undefined ? 'не определено' : adapter.dhcpEnabled ? 'включён' : 'выключен'}`,
    )
    for (const ip of adapter.ipv4)
      content.push(
        `- IPv4: ${redact(ip.address)}${ip.prefixLength === undefined ? '' : `/${ip.prefixLength}`} (строка ${ip.line})`,
      )
    for (const ip of adapter.ipv6) content.push(`- IPv6: ${redact(ip.address)} (строка ${ip.line})`)
    for (const field of ['gateways', 'dnsServers'] as const)
      for (const entry of adapter[field])
        content.push(
          `- ${field === 'gateways' ? 'Шлюз' : 'DNS'}: ${redact(entry.value)} (строка ${entry.line})`,
        )
    content.push('')
  }
  if (output?.kind === 'ping')
    content.push(
      '## ICMP',
      `- Отправлено: ${output.sent ?? 'неизвестно'}`,
      `- Получено: ${output.received ?? 'неизвестно'}`,
      `- Потеряно: ${output.lost ?? 'неизвестно'}`,
      `- Средний RTT: ${output.average ?? 'неизвестно'}`,
    )
  if (output?.kind === 'nslookup') {
    content.push('## DNS', `- Результат: ${output.outcome}`)
    for (const entry of output.addresses)
      content.push(`- Адрес: ${redact(entry.value)} (строка ${entry.line})`)
  }
  if (output?.kind === 'tracert') {
    content.push('## Трассировка', `- Переходов: ${output.hops.length}`)
    for (const hop of output.hops)
      content.push(
        `- Переход ${hop.hop}: ${hop.address ? redact(hop.address) : 'Без ответа'}; RTT: ${hop.times.map((t, index) => (t === null ? '*' : `${hop.lessThan[index] ? '<' : ''}${t} ms`)).join(', ')} (строка ${hop.line})`,
      )
  }
  if (output?.kind === 'route') {
    content.push('## Маршруты')
    for (const entry of [...output.ipv4Routes, ...output.ipv6Routes])
      content.push(
        `- ${redact(entry.destination)}/${entry.prefix} → ${entry.gateway === 'on-link' ? 'On-link' : redact(entry.gateway)}; метрика ${entry.metric} (строка ${entry.line})`,
      )
  }
  if (output?.kind === 'dns-records') {
    content.push('## Типизированный DNS (имена и TXT исключены)')
    for (const record of output.records)
      content.push(
        `- ${record.type}${record.address ? `: ${redact(record.address)}` : ''}; priority ${record.priority ?? '—'}; weight ${record.weight ?? '—'}; port ${record.port ?? '—'}; MX preference ${record.preference ?? '—'}; TTL ${record.ttl ?? '—'}; секция ${record.section ?? 'не определена'} (строка ${record.line})`,
      )
  }
  if (output?.kind === 'powershell') {
    content.push(`## PowerShell · ${output.cmdlet}`)
    if (output.cmdlet === 'Test-NetConnection')
      content.push(
        `- TCP ${output.connection.remotePort}: ${output.connection.tcpSucceeded}; адрес ${redact(output.connection.remoteAddress)}${output.connection.sourceAddress ? `; источник ${redact(output.connection.sourceAddress)}` : ''}`,
      )
    else
      for (const item of output.interfaces)
        content.push(
          `- Интерфейс ${item.index}; IPv4: ${item.ipv4.map(redact).join(', ')}; IPv6: ${item.ipv6.map(redact).join(', ')}; DNS: ${item.dns.map(redact).join(', ')}; шлюзы: ${item.gateways.map(redact).join(', ')}`,
        )
  }
  content.push('## Наблюдения')
  for (const finding of result.findings) {
    content.push(
      `### ${finding.ruleId} — ${finding.title}`,
      `- Важность: ${finding.severity}; уверенность: ${finding.confidence}`,
      finding.explanation,
      `Ограничение: ${finding.whatItDoesNotProve}`,
    )
    for (const step of finding.nextChecks)
      content.push(
        `- Следующая проверка: ${step.label}. ${step.why}${step.safeReadOnlyCommand ? ` Команда: ${step.safeReadOnlyCommand}` : ''}`,
      )
    content.push(
      `- Доказательства: ${finding.evidence.map((e) => `строки ${e.range.startLine}–${e.range.endLine}`).join(', ')}`,
      '',
    )
  }
  content.push(
    '## Ограничения',
    'Отчёт создан из текста команды и не подтверждает доступность устройств, интернета, DNS или VPN.',
    'Исходные строки, имена компьютера/адаптеров, описания, суффиксы и MAC исключены. Недокументационные IP заменены.',
    'Автоматическое обезличивание не гарантирует полного удаления конфиденциальных данных. Просмотрите отчёт перед передачей.',
  )
  return content.join('\n')
}

export function exportReport(result: AnalysisResult<ParsedOutput>, rawInput?: string): string {
  const report = redactReport(result)
  return rawInput === undefined
    ? report
    : `${report}\n\n## Исходный вывод — НЕ ОБЕЗЛИЧЕН\n\nВключён по явному подтверждению пользователя.\n\n${rawInput}\n`
}
export function downloadText(text: string, name: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
