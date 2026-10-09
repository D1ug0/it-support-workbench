import type { Adapter, ParsedIpconfig } from '../types/network'
import type { DiagnosticFinding, DiagnosticEvidence, ParseResult } from '../types/diagnostic'

const evidence = (adapter: Adapter, fields: string[]): DiagnosticEvidence[] => {
  const numbers = fields.flatMap((field) => adapter.fieldLines[field] ?? [])
  return (numbers.length ? [...new Set(numbers)] : [adapter.sourceRange.startLine]).map((line) => ({
    adapterId: adapter.id,
    range: { startLine: line, endLine: line },
  }))
}
export function evaluateIpconfig(parsed: ParseResult<ParsedIpconfig>): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = []
  for (const adapter of parsed.value?.adapters ?? []) {
    const add = (
      ruleId: string,
      title: string,
      explanation: string,
      limit: string,
      fields: string[],
      steps: DiagnosticFinding['nextChecks'],
      warning = false,
      confidence: DiagnosticFinding['confidence'] = 'high',
    ) => {
      findings.push({
        id: `${ruleId}-${adapter.id}`,
        ruleId,
        title,
        explanation,
        whatItDoesNotProve: limit,
        severity: warning ? 'warning' : 'info',
        confidence,
        evidence: evidence(adapter, fields),
        nextChecks: steps,
      })
    }
    const active =
      adapter.mediaState !== 'disconnected' && (adapter.ipv4.length > 0 || adapter.ipv6.length > 0)
    if (
      active &&
      adapter.dhcpEnabled === true &&
      adapter.ipv4.some((ip) => ip.address.startsWith('169.254.'))
    )
      add(
        'NET-001',
        'Адрес из диапазона APIPA',
        'Обнаружен IPv4 из 169.254.0.0/16 при включённом DHCP. Это может указывать на затруднение с получением адреса.',
        'Не доказывает отказ DHCP или отсутствие интернета: другой адаптер может работать.',
        ['ipv4', 'dhcpEnabled'],
        [
          {
            label: 'Проверьте подключение нужного интерфейса',
            why: 'Убедитесь, что кабель или Wi-Fi подключены.',
          },
          {
            label: 'Сравните адреса остальных адаптеров',
            why: 'Один интерфейс не описывает весь компьютер.',
            safeReadOnlyCommand: 'ipconfig /all',
          },
        ],
        true,
        'medium',
      )
    if (adapter.mediaState === 'disconnected')
      add(
        'NET-002',
        'Адаптер не подключён',
        'Windows сообщает, что среда передачи недоступна. Отсутствие адреса у отключённого интерфейса ожидаемо.',
        'Это само по себе не означает неисправность.',
        ['mediaState'],
        [
          {
            label: 'Убедитесь, что используется нужный адаптер',
            why: 'Неиспользуемые интерфейсы могут быть отключены.',
          },
        ],
      )
    const virtual =
      /vpn|virtual|виртуаль|tunnel|туннель|tap|tun\b|wireguard|hyper-v|loopback|vmware|vbox|wintun/i.test(
        `${adapter.displayName} ${adapter.description ?? ''}`,
      )
    if (active && adapter.ipv4.length && !adapter.gateways.length && !virtual)
      add(
        'NET-003',
        'Шлюз в секции не обнаружен',
        'У адаптера с IPv4 не указан основной шлюз. Выход за пределы локальной подсети через этот интерфейс может быть ограничен.',
        'Шлюз может находиться на другом адаптере. Для VPN и изолированных сетей его отсутствие нормально.',
        ['ipv4', 'gateways'],
        [
          {
            label: 'Проверьте таблицу маршрутов',
            why: 'Другие интерфейсы и отдельные маршруты могут обеспечивать доступ.',
            safeReadOnlyCommand: 'route print',
          },
        ],
        true,
        'low',
      )
    if (active && !adapter.dnsServers.length)
      add(
        'NET-004',
        'DNS в секции не обнаружены',
        'В прочитанной секции нет назначенных DNS-серверов.',
        'Политики, другой адаптер или неполный вывод могут объяснять это. Не доказывает неисправность DNS.',
        ['ipv4', 'ipv6', 'dnsServers'],
        [
          {
            label: 'Проверьте разрешение нужного имени',
            why: 'Используйте разрешённое имя из вашей среды.',
            safeReadOnlyCommand: 'nslookup example.com',
          },
        ],
        true,
        'low',
      )
    if (adapter.invalidMasks.length)
      add(
        'NET-005',
        'Маска не распознана',
        'Строка содержит некорректную или непрерывность нарушенную маску. Поле не интерпретировано.',
        'Исходник может быть повреждён. Это не доказывает, что Windows применяет такую маску.',
        ['mask'],
        [
          {
            label: 'Повторите копирование полного вывода',
            why: 'Убедитесь, что строки не обрезаны.',
            safeReadOnlyCommand: 'ipconfig /all',
          },
        ],
        true,
      )
    if (adapter.dnsServers.length > 1)
      add(
        'NET-006',
        'Несколько DNS-серверов',
        'В секции обнаружено несколько DNS-серверов. Это обычная конфигурация.',
        'Наличие адресов не подтверждает доступность серверов и порядок их фактического использования.',
        ['dnsServers'],
        [
          {
            label: 'Проверьте ответ на конкретный запрос',
            why: 'Конфигурация и доступность — разные проверки.',
            safeReadOnlyCommand: 'nslookup example.com',
          },
        ],
      )
    if (virtual)
      add(
        'NET-007',
        'Возможный виртуальный интерфейс',
        'Название или описание похоже на виртуальный, туннельный или VPN-интерфейс.',
        'Имя не подтверждает подключение VPN, работу маршрутов или split/full tunnel.',
        ['header', 'description'],
        [
          {
            label: 'Сопоставьте с таблицей маршрутов',
            why: 'Для пути к конкретному ресурсу нужна информация о маршрутах.',
            safeReadOnlyCommand: 'route print',
          },
        ],
        false,
        'low',
      )
  }
  if (parsed.status === 'partial')
    findings.push({
      id: 'NET-008',
      ruleId: 'NET-008',
      severity: 'warning',
      confidence: 'high',
      title: 'Вывод разобран частично',
      explanation: 'Некоторые строки или поля не интерпретированы. Достоверные значения сохранены.',
      whatItDoesNotProve:
        'Предупреждение относится к качеству разбора, а не доказывает сетевую неисправность.',
      nextChecks: [
        {
          label: 'Проверьте полный вывод и кодировку',
          why: 'Поддерживаются RU/EN метки CMD.',
          safeReadOnlyCommand: 'ipconfig /all',
        },
      ],
      evidence: parsed.warnings
        .filter((w) => w.range)
        .slice(0, 5)
        .map((w) => ({ range: w.range! })),
    })
  return findings.sort(
    (a, b) =>
      Number(b.severity === 'warning') - Number(a.severity === 'warning') ||
      a.ruleId.localeCompare(b.ruleId),
  )
}
