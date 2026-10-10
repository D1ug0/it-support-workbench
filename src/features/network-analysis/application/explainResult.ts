import type { AnalysisResult, EvidenceRange } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
export interface PlainFact {
  label: string
  text: string
  range?: EvidenceRange
}
export function explainResult(result: AnalysisResult<ParsedOutput>) {
  const output = result.parse.value
  const facts: PlainFact[] = []
  let headline = 'Пока недостаточно данных для разбора.'
  let limitation = 'Вставьте полный вывод одной поддерживаемой команды, а не её название.'
  let next = {
    label: 'Проверьте исходный текст',
    why: 'Поддерживаются стандартные выводы Windows CMD на русском и английском.',
    command: undefined as string | undefined,
  }
  if (!output) return { headline, facts, limitation, next }
  const line = (n?: number) => (n === undefined ? undefined : { startLine: n, endLine: n })
  if (output.kind === 'ipconfig') {
    headline = 'Настройки подключения прочитаны. Доступность сети ещё нужно проверить.'
    const assigned = output.adapters.filter(
      (a) => a.mediaState !== 'disconnected' && (a.ipv4.length || a.ipv6.length),
    )
    facts.push({
      label: 'Подключения компьютера',
      text: `В выводе найдено ${output.adapters.length} интерфейсов. Адрес указан у ${assigned.length} неотключённых интерфейсов.`,
      range: output.adapters[0]?.sourceRange,
    })
    const configured = assigned.filter((a) => a.dnsServers.length)
    facts.push({
      label: 'Серверы для поиска адресов',
      text: configured.length
        ? `DNS указан у ${configured.length} интерфейсов с адресом. Это настройка, а не результат DNS-запроса.`
        : 'У неотключённых интерфейсов с адресом DNS не найден. Выберите нужный интерфейс и проверьте полный вывод.',
      range: configured[0]?.sourceRange,
    })
    limitation =
      'Отключённый Wi-Fi не означает отказ Ethernet. Наличие IP и шлюза не подтверждает доступность интернета.'
    next = {
      label: 'Проверьте имя нужного ресурса',
      why: 'Убедитесь, что настроенный DNS возвращает адрес именно для вашей задачи. Замените example.com на разрешённое имя.',
      command: 'nslookup example.com',
    }
  } else if (output.kind === 'ping') {
    const replies = output.replies.filter((r) => r.outcome === 'reply')
    const timeouts = output.replies.filter((r) => r.outcome === 'timeout')
    const unreachable = output.replies.filter((r) => r.outcome === 'unreachable')
    headline = replies.length
      ? 'В выводе есть ICMP-ответы. Это ещё не проверка сайта или приложения.'
      : 'Ответов Echo Reply в разобранном выводе нет. Причина пока неизвестна.'
    facts.push({
      label: 'Что пришло в ответ',
      text: `Echo Reply: ${replies.length}; тайм-ауты: ${timeouts.length}; сообщения недоступности: ${unreachable.length}.`,
      range: line(output.replies[0]?.line),
    })
    if (output.sent !== undefined && output.lost !== undefined)
      facts.push({
        label: 'Итог Windows',
        text: `Отправлено: ${output.sent}. Указано потерянных сообщений: ${output.lost}. Счётчик Received сам по себе не различает Echo Reply и сообщения недоступности.`,
        range: line(output.statsLine),
      })
    limitation =
      'Отсутствие ICMP-ответа может быть связано с фильтрацией. Успешный ping не проверяет TCP, HTTPS или вход в приложение.'
    next = {
      label: 'Проверьте порт нужного сервиса',
      why: 'Для HTTPS пример использует 443. Подставьте разрешённые для своей задачи ресурс и порт; результат пока сверяется вручную.',
      command: 'Test-NetConnection example.com -Port 443',
    }
  } else if (output.kind === 'nslookup') {
    const labels = {
      answer: 'Получены адреса DNS-ответа.',
      timeout: 'В выводе есть тайм-аут DNS-запроса.',
      nxdomain: 'DNS сообщил, что имя не существует в данном контексте.',
      servfail: 'DNS сообщил об ошибке обработки запроса.',
      unknown: 'Итог DNS-запроса не удалось однозначно определить.',
    }
    headline = labels[output.outcome]
    facts.push({
      label: 'Сервер и ответ — разные поля',
      text: `Адрес сервера: ${output.serverAddress ? 'найден' : 'не найден'}. Адресов в ответе: ${output.addresses.length}.`,
      range: line(output.addresses[0]?.line ?? output.eventLines[0]),
    })
    limitation =
      'DNS-ответ показывает адрес, а не исправность сайта. Начальная ошибка может предшествовать успешному ответу; учитывайте весь вывод.'
    next = {
      label: 'Сопоставьте DNS с конфигурацией',
      why: 'В рабочей сессии добавьте ipconfig и nslookup одного устройства с фактическим временем проверок.',
      command: 'ipconfig /all',
    }
  } else if (output.kind === 'tracert') {
    const silent = output.hops.filter((h) => h.times.every((t) => t === null)).length
    headline = 'Трассировка показывает ответы переходов на пути к ресурсу.'
    facts.push({
      label: 'Сколько переходов разобрано',
      text: `Разобрано ${output.hops.length} переходов. Полностью без ответа: ${silent}. Маркер завершения: ${output.completed ? 'есть' : 'не найден'}.`,
      range: line(output.hops[0]?.line),
    })
    limitation =
      'Звёздочки у промежуточного перехода не доказывают разрыв пути. Маркер завершения сам по себе не подтверждает достижение нужного адреса.'
    next = {
      label: 'Сверьте цель и последний отвечающий переход',
      why: 'Проверьте адрес цели в заголовке и выводы наблюдений, затем проверьте нужный сервис.',
      command: undefined,
    }
  } else if (output.kind === 'dns-records') {
    headline = 'Прочитаны DNS-записи с типами и параметрами.'
    facts.push({
      label: 'Типы ответа',
      text: `Записей: ${output.records.length}. Типы: ${[...new Set(output.records.map((r) => r.type))].join(', ')}.`,
      range: line(output.records[0]?.line),
    })
    limitation =
      'Записи описывают DNS-данные. SRV не подтверждает доступность target/порта; TXT может содержать чувствительные значения.'
    next = {
      label: 'Сверьте имя, тип и контекст резолвера',
      why: 'Сопоставляйте ответ нужного запроса и секцию записи.',
      command: 'Resolve-DnsName example.com -Type A',
    }
  } else if (output.kind === 'powershell') {
    headline =
      output.cmdlet === 'Test-NetConnection'
        ? 'Разобрана проверка TCP-соединения.'
        : 'Прочитана IP-конфигурация PowerShell.'
    facts.push({
      label: output.cmdlet,
      text:
        output.cmdlet === 'Test-NetConnection'
          ? `Порт ${output.connection.remotePort}: ${output.connection.tcpSucceeded ? 'TCP установлен' : 'TCP не подтверждён'}.`
          : `Интерфейсов: ${output.interfaces.length}.`,
      range: line(
        output.cmdlet === 'Test-NetConnection'
          ? output.connection.line
          : output.interfaces[0]?.line,
      ),
    })
    limitation =
      'Объекты получены из введённого JSON, а не с устройства. TCP не подтверждает HTTPS и права; конфигурация не доказывает доступность.'
    next = {
      label: 'Сопоставьте с ошибкой приложения',
      why: 'Для TCP отдельно проверяйте TLS/HTTP/вход; для конфигурации — нужный ресурс.',
      command: undefined,
    }
  } else {
    headline = 'Таблица маршрутов прочитана. Для выбора пути нужен адрес ресурса.'
    facts.push({
      label: 'Правила направления трафика',
      text: `IPv4-маршрутов: ${output.ipv4Routes.length}. IPv6-маршрутов: ${output.ipv6Routes.length}.`,
      range: line(output.ipv4Routes[0]?.line ?? output.ipv6Routes[0]?.line),
    })
    limitation =
      'Таблица не подтверждает, что ресурс доступен. Реальный выбор Windows также зависит от контекста и политики.'
    next = {
      label: 'Проверьте маршрут к конкретному IPv4',
      why: 'Откройте инструменты и укажите адрес ресурса. Сначала учитывается наиболее длинный подходящий префикс.',
      command: undefined,
    }
  }
  const priority = [...result.findings]
    .sort(
      (a, b) =>
        ({ critical: 0, warning: 1, info: 2 })[a.severity] -
        { critical: 0, warning: 1, info: 2 }[b.severity],
    )
    .find((f) => f.severity !== 'info')
  const step = priority?.nextChecks[0]
  if (priority)
    facts.unshift({
      label: priority.title,
      text: priority.explanation,
      range: priority.evidence[0]?.range,
    })
  if (step) next = { label: step.label, why: step.why, command: step.safeReadOnlyCommand }
  return { headline, facts: facts.slice(0, 3), limitation, next }
}
