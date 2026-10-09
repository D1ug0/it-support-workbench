import { describe, it, expect } from 'vitest'
import { parsePing, parseNslookup, parseTracert, parseRoutes } from './outputParsers'
import { evaluateOutput } from '../../domain/rules/outputRules'
import { detectCommand } from './detectCommand'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'
import { exportReport } from '../export/exportReport'
import ping from '../../fixtures/ping-en.txt?raw'
import pingRu from '../../fixtures/ping-ru.txt?raw'
import lookup from '../../fixtures/nslookup-en.txt?raw'
import lookupRu from '../../fixtures/nslookup-ru.txt?raw'
import trace from '../../fixtures/tracert-en.txt?raw'
import traceRu from '../../fixtures/tracert-ru.txt?raw'
import routes from '../../fixtures/route-en.txt?raw'
import routesRu from '../../fixtures/route-ru.txt?raw'

describe('Windows ping', () => {
  it('rejects contradictory RTT and unsafe packet counters', () => {
    const rtt = parsePing(
      ping.replace(/Minimum[^\n]+/, 'Minimum = 9ms, Maximum = 2ms, Average = 5ms'),
    )
    expect(rtt.value?.average).toBeUndefined()
    expect(rtt.warnings.map((w) => w.code)).toContain('PING_RTT_INVALID')
    expect(
      parsePing('Packets: Sent = 9007199254740993, Received = 9007199254740993, Lost = 0').status,
    ).toBe('unsupported')
  })
  it.each([ping, pingRu])('reads packet counts and RTT', (text) => {
    const p = parsePing(text)
    expect(p.status).toBe('ok')
    expect(p.value?.sent).toBe(4)
    expect(p.value?.average).toBe(8)
    expect(p.value?.replies).toHaveLength(4)
    expect(p.value?.replies[1]?.lessThan).toBe(true)
  })
  it('distinguishes unreachable from successful Echo Reply', () => {
    const text =
      'Pinging example.com [192.0.2.20] with 32 bytes of data:\nReply from 192.0.2.1: Destination host unreachable.\nPackets: Sent = 1, Received = 1, Lost = 0'
    const p = parsePing(text)
    expect(p.value?.replies[0]?.outcome).toBe('unreachable')
    expect(evaluateOutput(p).some((f) => f.ruleId === 'PING-002')).toBe(false)
    expect(evaluateOutput(p).some((f) => f.ruleId === 'PING-003')).toBe(true)
  })
  it('does not infer host shutdown from loss', () => {
    const finding = evaluateOutput(parsePing(ping))[0]
    expect(finding?.whatItDoesNotProve).toContain('не доказывает')
    expect(finding?.severity).not.toBe('critical')
  })
  it('handles incomplete and broken counters', () => {
    expect(parsePing('Reply from 192.0.2.20: time=1ms TTL=56').status).toBe('partial')
    expect(
      parsePing(ping.replace('Lost = 1', 'Lost = 9')).warnings.some(
        (w) => w.code === 'PING_STATS_INVALID',
      ),
    ).toBe(true)
    expect(parsePing('Reply from 192.0.2.1: strange').status).toBe('unsupported')
  })
  it('reads Russian timeout and English replies', () => {
    expect(parsePing('Превышен интервал ожидания для запроса.').value?.replies[0]?.outcome).toBe(
      'timeout',
    )
    expect(evaluateOutput(parsePing(pingRu)).some((f) => f.ruleId === 'PING-002')).toBe(true)
  })
})
describe('Windows nslookup', () => {
  it.each([lookup, lookupRu])('distinguishes server address from answer', (text) => {
    const p = parseNslookup(text)
    expect(p.status).toBe('ok')
    expect(p.value?.serverAddress).toBe('192.0.2.53')
    expect(p.value?.addresses.map((a) => a.value)).toEqual(['2001:db8::20', '192.0.2.20'])
  })
  it.each([
    ['Non-existent domain', 'nxdomain'],
    ['Server failed', 'servfail'],
    ['DNS request timed out.', 'timeout'],
    ['несуществующий домен', 'nxdomain'],
    ['сбой сервера', 'servfail'],
  ])('reads error %s', (text, outcome) => {
    expect(
      parseNslookup('Server: dns.lab.example\nAddress: 192.0.2.53\n' + text).value?.outcome,
    ).toBe(outcome)
  })
  it('preserves successful answer after initial reverse DNS timeout', () =>
    expect(parseNslookup('DNS request timed out.\n' + lookup).value?.outcome).toBe('answer'))
  it('handles bad fields and incomplete server-only output', () => {
    expect(parseNslookup('Server: dns.lab.example\nAddress: invalid').status).toBe('partial')
    expect(parseNslookup('Server: dns.lab.example').value?.outcome).toBe('unknown')
    expect(parseNslookup('hello').status).toBe('unsupported')
  })
})
describe('Windows tracert', () => {
  it('preserves less-than RTT measurements in the parsed model and exported report', () => {
    const parsed = parseTracert(trace)
    expect(parsed.value?.hops[0]?.lessThan).toEqual([false, false, true])
    expect(exportReport(analyzeOutput(trace))).toContain('<1')
  })
  it.each([trace, traceRu])('reads three probes and silent middle hop', (text) => {
    const p = parseTracert(text)
    expect(p.status).toBe('ok')
    expect(p.value?.hops).toHaveLength(3)
    expect(p.value?.hops[1]?.times).toEqual([null, null, null])
    expect(p.value?.targetAddress).toBe('192.0.2.20')
    expect(evaluateOutput(p).some((f) => f.ruleId === 'TRACE-002')).toBe(true)
  })
  it('does not infer outage from a middle star', () => {
    expect(
      evaluateOutput(parseTracert(trace)).find((f) => f.ruleId === 'TRACE-001')?.whatItDoesNotProve,
    ).toContain('не доказывает')
  })
  it('marker completion alone is insufficient to claim target reached', () => {
    const p = parseTracert(trace.replace('demo.example [192.0.2.20]', '192.0.2.19'))
    expect(evaluateOutput(p).some((f) => f.ruleId === 'TRACE-003')).toBe(true)
  })
  it('handles incomplete hops, missing completion and numeric targets', () => {
    expect(parseTracert('Tracing route to 2001:db8::1\n 1 1 ms 1 ms 1 ms 2001:db8::1').status).toBe(
      'partial',
    )
    expect(
      parseTracert(trace.replace('1 ms     1 ms    <1 ms', 'garbled')).warnings.some(
        (w) => w.code === 'TRACE_HOP_INVALID',
      ),
    ).toBe(true)
    expect(parseTracert('hello').status).toBe('unsupported')
  })
})
describe('Windows route print', () => {
  it('rejects fractional IPv4 route metrics', () =>
    expect(parseRoutes('IPv4 Route Table\n0.0.0.0 0.0.0.0 192.0.2.1 192.0.2.10 2.5').status).toBe(
      'unsupported',
    ))
  it.each([routes, routesRu])('reads v4 and v6 active routes', (text) => {
    const p = parseRoutes(text)
    expect(p.status).toBe('ok')
    expect(p.value?.ipv4Routes[0]).toMatchObject({ prefix: 0, gateway: '192.0.2.1', metric: 25 })
    expect(p.value?.ipv4Routes[1]?.gateway).toBe('on-link')
    expect(p.value?.ipv6Routes[0]?.prefix).toBe(0)
  })
  it('ignores persistent routes', () => {
    const p = parseRoutes(routes + '\n0.0.0.0 0.0.0.0 192.0.2.2 192.0.2.10 50')
    expect(p.value?.ipv4Routes).toHaveLength(3)
  })
  it('reads IPv6 wrapped gateway', () =>
    expect(
      parseRoutes('IPv6 Route Table\n11 25 2001:db8::/64\n 2001:db8::1').value?.ipv6Routes[0]
        ?.gateway,
    ).toBe('2001:db8::1'))
  it.each([
    '11 25 2001:db8::/64',
    '11 25 2001:db8::/64\n bad',
    '11 25 z::/64 On-link',
    '11 25 2001:db8::/129 On-link',
    '11 25 2001:db8::/64 bad',
  ])('rejects corrupt IPv6 row %s', (row) =>
    expect(parseRoutes('IPv6 Route Table\n' + row).warnings.length).toBeGreaterThan(0),
  )
  it.each([
    '0.0.0.0 255.0.255.0 192.0.2.1 192.0.2.10 25',
    '0.0.0.0 0.0.0.0 192.0.2.1 broken 25',
    '0.0.0.0 0.0.0.0 192.0.2.1 192.0.2.10 bad',
  ])('rejects corrupt IPv4 row', (row) =>
    expect(
      parseRoutes('IPv4 Route Table\n' + row).warnings.some((w) => w.code === 'ROUTE_INVALID'),
    ).toBe(true),
  )
  it('explains missing default without global outage claim', () => {
    const p = parseRoutes('IPv4 Route Table\n192.0.2.0 255.255.255.0 On-link 192.0.2.10 25')
    expect(evaluateOutput(p)[0]?.ruleId).toBe('ROUTE-002')
  })
})
describe('registry, inference and privacy', () => {
  it.each([
    [ping, 'ping'],
    [lookup, 'nslookup'],
    [trace, 'tracert'],
    [routes, 'route'],
  ] as const)('detects and exports %s', (text, kind) => {
    expect(detectCommand(text).kind).toBe(kind)
    expect(analyzeOutput(text).parse.kind).toBe(kind)
    expect(exportReport(analyzeOutput(text.replaceAll('192.0.2.', '10.42.0.')))).not.toContain(
      '10.42.0.',
    )
  })
  it('rejects mixed command content instead of merging hosts', () => {
    expect(detectCommand(ping + '\n' + routes).kind).toBe('unknown')
    expect(analyzeOutput(ping + '\n' + routes).parse.status).toBe('unsupported')
  })
  it.each([parsePing, parseNslookup, parseTracert, parseRoutes])(
    'handles invalid and unsupported input',
    (parser) => {
      expect(parser('').status).toBe('invalid')
      expect(parser('unknown').status).toBe('unsupported')
    },
  )
  it('empty models do not create findings', () =>
    expect(evaluateOutput({ kind: 'unknown', status: 'invalid', warnings: [] })).toEqual([]))
})
