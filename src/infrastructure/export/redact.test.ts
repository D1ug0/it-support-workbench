import { describe, it, expect } from 'vitest'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'
import { examples } from '../../fixtures'
import { createAddressRedactor, displayAddress } from './redact'
import { exportReport, redactReport } from './exportReport'

const sensitive = examples[0]!.text
  .replaceAll('DEMO-PC', 'PRIVATE-HOST')
  .replaceAll('Ethernet adapter Ethernet:', 'Ethernet adapter private-name:')
  .replaceAll('lab.example', 'private.example')
  .replaceAll('192.0.2.', '10.42.0.')
  .replace('2001:db8::10', 'fd00::10')
describe('safe report export', () => {
  it('omits all raw identifiers and nondocumentation addresses', () => {
    const report = redactReport(analyzeOutput(sensitive))
    for (const secret of [
      'PRIVATE-HOST',
      'private-name',
      'private.example',
      '02-00-00-00-00-01',
      'Demo Ethernet',
      '10.42.0.',
      'fd00::10',
      'Windows IP Configuration',
    ])
      expect(report).not.toContain(secret)
    expect(report).toContain('NET-006')
    expect(report).toContain('Адаптеров: 2')
  })
  it('keeps documentation addresses and counts', () => {
    const report = redactReport(analyzeOutput(examples[0]!.text))
    expect(report).toContain('192.0.2.10/24')
    expect(report).toContain('2001:db8::10')
    expect(report).toContain('строки 21–21')
  })
  it('uses stable replacement identifiers', () => {
    const redact = createAddressRedactor()
    expect(redact('10.0.0.1')).toBe('[IPv4 1]')
    expect(redact('10.0.0.1')).toBe('[IPv4 1]')
    expect(redact('fd00::1')).toBe('[IPv6 2]')
    expect(displayAddress('10.0.0.1', true)).toBe('10.0.0.1')
    expect(displayAddress('10.0.0.1', false)).toBe('[IPv4 1]')
  })
  it('only includes raw text when provided explicitly', () => {
    const result = analyzeOutput(sensitive)
    expect(exportReport(result)).not.toContain('PRIVATE-HOST')
    expect(exportReport(result, sensitive)).toContain('НЕ ОБЕЗЛИЧЕН')
    expect(exportReport(result, sensitive)).toContain('PRIVATE-HOST')
  })
  it('does not export arbitrary user strings from findings or adapters', () => {
    const result = analyzeOutput(
      examples[0]!.text.replace(
        'Ethernet adapter Ethernet:',
        'Ethernet adapter <script>SECRET</script>:',
      ),
    )
    expect(exportReport(result)).not.toContain('SECRET')
  })
  it('works on invalid and incomplete reports', () => {
    expect(redactReport(analyzeOutput(''))).toContain('Адаптеров: 0')
    expect(redactReport(analyzeOutput(examples[4]!.text))).toContain('NET-008')
  })
})
