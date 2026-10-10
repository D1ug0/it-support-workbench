import type { DiagnosticFinding, ParseResult } from '../types/diagnostic'
import type { ParsedOutput } from '../types/outputs'

export function evaluateOutput(parsed: ParseResult<ParsedOutput>): DiagnosticFinding[] {
  const output = parsed.value
  if (!output) return []
  const findings: DiagnosticFinding[] = []
  const add = (
    ruleId: string,
    title: string,
    explanation: string,
    limit: string,
    lines: number[],
    warning = false,
    command?: string,
  ) =>
    findings.push({
      id: ruleId,
      ruleId,
      title,
      explanation,
      whatItDoesNotProve: limit,
      severity: warning ? 'warning' : 'info',
      confidence: 'high',
      evidence: lines.map((line) => ({ range: { startLine: line, endLine: line } })),
      nextChecks: [
        {
          label: 'Сопоставьте с конкретным ресурсом и временем проверки',
          why: 'Вывод описывает только эту проверку.',
          safeReadOnlyCommand: command,
        },
      ],
    })
  if (output.kind === 'ping') {
    const unreachable = output.replies.filter((r) => r.outcome === 'unreachable')
    if (output.lost)
      add(
        'PING-001',
        'В статистике есть потери ICMP',
        `Не получены ответы на ${output.lost} из ${output.sent} отправленных пакетов.`,
        'ICMP может фильтроваться или ограничиваться. Это не доказывает выключение устройства или отказ TCP-сервиса.',
        [output.statsLine!],
        true,
        'Test-NetConnection example.com -Port 443',
      )
    else if (output.received && output.replies.some((r) => r.outcome === 'reply'))
      add(
        'PING-002',
        'Получены ICMP Echo Reply',
        'Вывод содержит ответ на эхо-запрос.',
        'Это не подтверждает работу DNS, приложения или конкретного TCP-порта.',
        [output.replies.find((r) => r.outcome === 'reply')!.line],
        false,
        'Test-NetConnection example.com -Port 443',
      )
    if (unreachable.length)
      add(
        'PING-003',
        'Сообщение о недостижимости',
        'В выводе есть ответ Destination unreachable. Он отличается от успешного Echo Reply.',
        'Полученный ICMP error может учитываться в счётчике Received. Это не подтверждает ответ целевого устройства.',
        unreachable.map((r) => r.line),
        true,
        'route print',
      )
  } else if (output.kind === 'nslookup') {
    const titles = {
      answer: 'Получен DNS-ответ',
      timeout: 'В выводе есть тайм-аут DNS',
      nxdomain: 'Сервер сообщил NXDOMAIN',
      servfail: 'Сервер сообщил SERVFAIL',
      unknown: 'DNS-ответ не найден',
    }
    add(
      'DNS-001',
      titles[output.outcome],
      output.outcome === 'answer'
        ? 'В ответе найдены адреса запрошенного имени.'
        : output.outcome === 'nxdomain'
          ? 'DNS сообщил, что запрошенное имя не существует в контексте этого запроса.'
          : output.outcome === 'servfail'
            ? 'DNS сообщил о невозможности завершить запрос.'
            : 'Нет подтверждённого ответа на запрос.',
      'Один запрос не описывает все DNS-зоны и не доказывает работоспособность сайта. Тайм-аут обратного поиска имени сервера может предшествовать успешному ответу.',
      output.eventLines.length ? output.eventLines : [1],
      output.outcome !== 'answer',
      'ipconfig /all',
    )
  } else if (output.kind === 'tracert') {
    const silent = output.hops.filter((h) => h.times.some((time) => time === null))
    if (silent.length)
      add(
        'TRACE-001',
        'Некоторые пробы без ответа',
        'Звёздочка означает отсутствие ответа на соответствующую пробу до тайм-аута.',
        'Промежуточный маршрутизатор может не отвечать на ICMP и продолжать пересылку. Один пропуск не доказывает разрыв маршрута.',
        silent.slice(0, 8).map((h) => h.line),
        false,
        'ping example.com',
      )
    if (output.targetAddress && output.hops.at(-1)?.address === output.targetAddress)
      add(
        'TRACE-002',
        'Последний переход совпадает с целью',
        'Адрес последнего отвечающего перехода совпадает с адресом цели в заголовке.',
        'Это не подтверждает доступность приложения или порта.',
        [output.hops.at(-1)!.line],
        false,
        'Test-NetConnection example.com -Port 443',
      )
    else if (output.hops.length)
      add(
        'TRACE-003',
        'Цель в переходах не подтверждена',
        'Среди прочитанных переходов не подтверждён ответ адреса цели.',
        'Даже маркер завершения трассировки не гарантирует достижения цели.',
        [output.hops.at(-1)!.line],
        true,
        'route print',
      )
  } else if (output.kind === 'dns-records') {
    add(
      'DNS-RECORDS-001',
      'Прочитаны типизированные DNS-записи',
      `Записей: ${output.records.length}; типов: ${[...new Set(output.records.map((r) => r.type))].join(', ')}.`,
      'MX/TXT/SRV описывают данные DNS. Запись не подтверждает доступность сервиса или корректность всех настроек.',
      output.records.slice(0, 8).map((r) => r.line),
      false,
      'Resolve-DnsName example.com -Type A',
    )
    if (output.records.some((r) => r.type === 'SRV'))
      add(
        'DNS-SRV-001',
        'SRV содержит параметры выбора сервиса',
        'Сначала сравнивается priority; weight применяется между записями одного priority.',
        'Проверяйте target, порт и транспорт. Ответ не подтверждает работу AD/Kerberos.',
        output.records
          .filter((r) => r.type === 'SRV')
          .slice(0, 8)
          .map((r) => r.line),
      )
  } else if (output.kind === 'powershell') {
    if (output.cmdlet === 'Test-NetConnection')
      add(
        'PS-TCP-001',
        output.connection.tcpSucceeded
          ? 'TCP-соединение подтверждено'
          : 'TCP-соединение не подтверждено',
        `Проверен TCP-порт ${output.connection.remotePort}. Результат: ${output.connection.tcpSucceeded}.`,
        'TCP не проверяет TLS, HTTP или авторизацию; отказ не доказывает выключение хоста.',
        [output.connection.line],
        !output.connection.tcpSucceeded,
      )
    else
      add(
        'PS-IP-001',
        'Прочитана IP-конфигурация PowerShell',
        `Интерфейсов: ${output.interfaces.length}.`,
        'Назначенные адреса и DNS не подтверждают доступность сети.',
        output.interfaces.slice(0, 8).map((i) => i.line),
        false,
        'Test-NetConnection example.com -Port 443',
      )
  } else if (output.kind === 'route') {
    const defaults = [
      ...output.ipv4Routes.filter((r) => r.destination === '0.0.0.0' && r.prefix === 0),
      ...output.ipv6Routes.filter((r) => r.destination === '::' && r.prefix === 0),
    ]
    if (defaults.length)
      add(
        'ROUTE-001',
        'Обнаружены маршруты по умолчанию',
        `Найдено записей с префиксом /0: ${defaults.length}.`,
        'Выбор маршрута зависит от наиболее длинного подходящего префикса и метрик. Таблица не доказывает доступность шлюза или работу VPN.',
        defaults.map((r) => r.line),
        false,
        'tracert example.com',
      )
    else
      add(
        'ROUTE-002',
        'Маршрут по умолчанию не обнаружен',
        'В прочитанных таблицах нет /0. Для отдельных сетей могут существовать специальные маршруты.',
        'Неполный вывод может не содержать все записи. Нельзя утверждать, что весь компьютер лишён доступа.',
        [output.ipv4Routes[0]?.line ?? output.ipv6Routes[0]!.line],
        true,
        'ipconfig /all',
      )
  }
  if (parsed.status === 'partial')
    add(
      'OUTPUT-001',
      'Вывод разобран частично',
      'Некоторые поля или итоговые строки отсутствуют.',
      'Это ограничение разбора, а не сетевой диагноз.',
      parsed.warnings.flatMap((w) => (w.range ? [w.range.startLine] : [])).slice(0, 5),
      true,
    )
  return findings
}
