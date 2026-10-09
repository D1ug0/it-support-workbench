import { ipv4ToNumber, isIPv4 } from './network'
import type { ParsedRoutes } from './types/outputs'
export function selectIPv4Routes(routes: ParsedRoutes, target: string) {
  if (!isIPv4(target)) throw new Error('Введите корректный IPv4-адрес цели.')
  const address = ipv4ToNumber(target)
  const matches = routes.ipv4Routes
    .filter((route) => {
      const size = 2 ** (32 - route.prefix)
      return Math.floor(address / size) === Math.floor(ipv4ToNumber(route.destination) / size)
    })
    .sort((a, b) => b.prefix - a.prefix || a.metric - b.metric)
  const first = matches[0]
  const candidates = first
    ? matches.filter((route) => route.prefix === first.prefix && route.metric === first.metric)
    : []
  return { matches, candidates, ambiguous: candidates.length > 1 }
}
