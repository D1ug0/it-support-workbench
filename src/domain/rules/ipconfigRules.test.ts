import { describe, it, expect } from 'vitest'
import { evaluateIpconfig } from './ipconfigRules'
import { parseIpconfig } from '../diagnostics/parsers/ipconfigParser'
import { examples } from '../../fixtures'

const rules = (text: string) => evaluateIpconfig(parseIpconfig(text))
const normal = examples[0]!.text
describe('NET-001..NET-008', () => {
  it('reports APIPA as hypothesis without critical', () => {
    const result = rules(examples[2]!.text)
    const finding = result.find((f) => f.ruleId === 'NET-001')
    expect(finding?.confidence).toBe('medium')
    expect(finding?.whatItDoesNotProve).toContain('другой адаптер')
    expect(result.every((f) => f.severity !== 'critical')).toBe(true)
  })
  it('does not flag APIPA with DHCP off or on disconnected interface', () => {
    expect(
      rules(examples[2]!.text.replace(': Yes', ': No')).some((f) => f.ruleId === 'NET-001'),
    ).toBe(false)
    expect(
      rules(examples[2]!.text + '\n   Media State : Media disconnected').some(
        (f) => f.ruleId === 'NET-001',
      ),
    ).toBe(false)
  })
  it('treats disconnected adapter as information', () => {
    expect(rules(normal).find((f) => f.ruleId === 'NET-002')?.severity).toBe('info')
    expect(rules(examples[5]!.text).every((f) => f.severity === 'info')).toBe(true)
  })
  it('does not diagnose lost internet across adapters', () => {
    const result = rules(examples[2]!.text + normal.slice(normal.indexOf('Ethernet adapter')))
    expect(result.find((f) => f.ruleId === 'NET-001')?.whatItDoesNotProve).toContain(
      'Не доказывает',
    )
    expect(result.every((f) => f.severity !== 'critical')).toBe(true)
  })
  it('finds missing gateway in active ethernet', () => {
    expect(rules(normal.replace('192.0.2.1\n', '\n')).some((f) => f.ruleId === 'NET-003')).toBe(
      true,
    )
  })
  it('does not warn on VPN without gateway', () => {
    expect(rules(examples[3]!.text).some((f) => f.ruleId === 'NET-003')).toBe(false)
    expect(rules(examples[3]!.text).some((f) => f.ruleId === 'NET-007')).toBe(true)
  })
  it('finds missing DNS only on active adapter', () => {
    expect(rules(examples[2]!.text).some((f) => f.ruleId === 'NET-004')).toBe(true)
    expect(rules(examples[5]!.text).some((f) => f.ruleId === 'NET-004')).toBe(false)
  })
  it('covers malformed masks and partial result', () => {
    const ids = rules(examples[4]!.text).map((f) => f.ruleId)
    expect(ids).toContain('NET-005')
    expect(ids).toContain('NET-008')
  })
  it('follows both DNS source lines', () => {
    expect(
      rules(normal)
        .find((f) => f.ruleId === 'NET-006')
        ?.evidence.map((e) => e.range.startLine),
    ).toEqual([21, 22])
  })
  it('does not mutate the parsed model', () => {
    const p = parseIpconfig(normal)
    const copy = structuredClone(p)
    evaluateIpconfig(p)
    expect(p).toEqual(copy)
  })
  it('has evidence and next steps for every finding', () => {
    for (const example of examples)
      for (const finding of rules(example.text)) {
        expect(finding.evidence.length).toBeGreaterThan(0)
        expect(finding.nextChecks.length).toBeGreaterThan(0)
      }
  })
  it('normal, RFC1918, loopback and IPv6-only are not critical', () => {
    for (const address of ['10.0.0.10', '172.16.0.10', '192.168.0.10', '127.0.0.1']) {
      expect(
        rules(normal.replace('192.0.2.10', address)).every((f) => f.severity !== 'critical'),
      ).toBe(true)
    }
  })
  it('empty unsupported model produces no findings', () => expect(rules('hello')).toEqual([]))
})
