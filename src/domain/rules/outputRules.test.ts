import { describe, it, expect } from 'vitest'
import { evaluateOutput } from './outputRules'
import {
  parsePing,
  parseNslookup,
  parseTracert,
  parseRoutes,
} from '../../infrastructure/parser/outputParsers'
import { exportReport } from '../../infrastructure/export/exportReport'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'

describe('output interpretation boundaries', () => {
  it.each(['Non-existent domain', 'Server failed', 'DNS request timed out.'])(
    'explains DNS outcome %s',
    (error) => {
      const findings = evaluateOutput(
        parseNslookup(`Server: dns.lab.example\nAddress: 192.0.2.53\n${error}`),
      )
      expect(findings[0]?.severity).toBe('warning')
      expect(findings[0]?.evidence.length).toBeGreaterThan(0)
    },
  )
  it('explains incomplete DNS output and success with no global service claim', () => {
    expect(evaluateOutput(parseNslookup('Server: dns.lab.example'))[0]?.title).toBe(
      'DNS-ответ не найден',
    )
    expect(
      evaluateOutput(parseNslookup('Name: demo.example\nAddress: 192.0.2.10'))[0]?.severity,
    ).toBe('info')
  })
  it('retains partial ping reply with direct evidence', () => {
    const p = parsePing('Reply from 192.0.2.20: bytes=32 time=1ms TTL=56')
    const f = evaluateOutput(p)
    expect(f.some((item) => item.ruleId === 'OUTPUT-001')).toBe(true)
    expect(f.every((item) => item.evidence.length)).toBe(true)
  })
  it('silence with completed trace does not count as target response', () => {
    const p = parseTracert(
      'Tracing route to 192.0.2.20\n 1 * * * Request timed out.\nTrace complete.',
    )
    expect(evaluateOutput(p).some((f) => f.ruleId === 'TRACE-002')).toBe(false)
  })
  it('IPv6-only route table can lack a default', () => {
    expect(
      evaluateOutput(parseRoutes('IPv6 Route Table\n11 25 2001:db8::/64 On-link'))[0]?.ruleId,
    ).toBe('ROUTE-002')
  })
  it('exports incomplete measurements without fabricated zero values', () => {
    const report = exportReport(
      analyzeOutput('Reply from 192.0.2.20: bytes=32 time=1ms TTL=56', 'ping'),
    )
    expect(report).toContain('Отправлено: неизвестно')
    expect(report).toContain('Средний RTT: неизвестно')
  })
})
