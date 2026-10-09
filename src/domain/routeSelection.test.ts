import { describe, it, expect } from 'vitest'
import { selectIPv4Routes } from './routeSelection'
import type { ParsedRoutes } from './types/outputs'
const route = (destination: string, prefix: number, metric: number, line = 1) => ({
  destination,
  prefix,
  metric,
  line,
  mask: '0.0.0.0',
  gateway: '192.0.2.1',
  interface: '192.0.2.10',
})
describe('route candidates from explicit output', () => {
  it('prioritizes longest prefix over metric and then metric among equally specific routes', () => {
    const routes: ParsedRoutes = {
      kind: 'route',
      ipv6Routes: [],
      ipv4Routes: [
        route('0.0.0.0', 0, 1),
        route('192.0.2.0', 24, 500),
        route('192.0.2.0', 24, 100, 3),
      ],
    }
    const before = structuredClone(routes)
    expect(selectIPv4Routes(routes, '192.0.2.20').candidates[0]?.metric).toBe(100)
    expect(routes).toEqual(before)
  })
  it('keeps tied routes ambiguous, handles host routes and absent matches', () => {
    const routes: ParsedRoutes = {
      kind: 'route',
      ipv6Routes: [],
      ipv4Routes: [route('192.0.2.20', 32, 1), route('192.0.2.20', 32, 1, 2)],
    }
    expect(selectIPv4Routes(routes, '192.0.2.20').ambiguous).toBe(true)
    expect(selectIPv4Routes(routes, '192.0.2.21').candidates).toEqual([])
    expect(() => selectIPv4Routes(routes, 'bad')).toThrow('IPv4')
  })
})
