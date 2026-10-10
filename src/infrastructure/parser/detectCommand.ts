import type { CommandKind } from '../../domain/types/diagnostic'

export interface Detection {
  kind: CommandKind | 'unknown'
  confidence: 'high' | 'medium' | 'low'
}
export function detectCommand(text: string): Detection {
  const kinds: CommandKind[] = []
  if (/^\s*[[{]/.test(text)) {
    try {
      const value: unknown = JSON.parse(text),
        rows = Array.isArray(value) ? value : [value]
      const objects = rows.filter(
        (v): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null && !Array.isArray(v),
      )
      if (objects.some((v) => Object.hasOwn(v, 'Name') && Object.hasOwn(v, 'Type')))
        kinds.push('dns-records')
      if (
        objects.some(
          (v) =>
            Object.hasOwn(v, 'TcpTestSucceeded') ||
            (Object.hasOwn(v, 'InterfaceIndex') && Object.hasOwn(v, 'IPv4Address')),
        )
      )
        kinds.push('powershell')
      return {
        kind: kinds.length === 1 ? kinds[0]! : 'unknown',
        confidence: kinds.length === 1 ? 'high' : 'low',
      }
    } catch {
      return { kind: 'unknown', confidence: 'low' }
    }
  }
  const extended =
    /MX preference\s*=|предпочтение MX\s*=|SRV service location\s*:|расположение службы SRV\s*:|^\s*\S+\s+(?:text|текст)\s*=/im.test(
      text,
    )
  if (extended) kinds.push('dns-records')
  if (/Windows IP Configuration|Настройка (?:протокола IP|IP)|Параметры IP для Windows/i.test(text))
    kinds.push('ipconfig')
  if (/Pinging |Обмен пакетами с |Ping statistics|Статистика Ping/i.test(text)) kinds.push('ping')
  if (
    !extended &&
    ((/^\s*(?:Server|Сервер)\s*:/im.test(text) &&
      /^\s*(?:Name|Имя|Address|Адрес)\s*:/im.test(text)) ||
      /DNS request timed out|NXDOMAIN|non-existent domain/i.test(text))
  )
    kinds.push('nslookup')
  if (/Tracing route to|Трассировка маршрута к/i.test(text)) kinds.push('tracert')
  if (/IPv[46] Route Table|Таблица маршрута IPv[46]/i.test(text)) kinds.push('route')
  if (kinds.length === 1) return { kind: kinds[0]!, confidence: 'high' }
  if (kinds.length > 1) return { kind: 'unknown', confidence: 'low' }
  const fields =
    text.match(
      /IPv4.{0,30}:|Subnet Mask|Маска подсети|DNS Servers|DNS-серверы|DHCP Enabled|DHCP включен/gi,
    ) ?? []
  return fields.length >= 2
    ? { kind: 'ipconfig', confidence: 'medium' }
    : { kind: 'unknown', confidence: 'low' }
}
