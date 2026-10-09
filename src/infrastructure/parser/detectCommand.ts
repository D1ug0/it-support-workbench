import type { CommandKind } from '../../domain/types/diagnostic'

export interface Detection {
  kind: CommandKind | 'unknown'
  confidence: 'high' | 'medium' | 'low'
}
export function detectCommand(text: string): Detection {
  const kinds: CommandKind[] = []
  if (/Windows IP Configuration|Настройка (?:протокола IP|IP)|Параметры IP для Windows/i.test(text))
    kinds.push('ipconfig')
  if (/Pinging |Обмен пакетами с |Ping statistics|Статистика Ping/i.test(text)) kinds.push('ping')
  if (
    (/^\s*(?:Server|Сервер)\s*:/im.test(text) &&
      /^\s*(?:Name|Имя|Address|Адрес)\s*:/im.test(text)) ||
    /DNS request timed out|NXDOMAIN|non-existent domain/i.test(text)
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
