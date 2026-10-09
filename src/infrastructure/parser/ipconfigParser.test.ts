import { describe, it, expect } from 'vitest'
import { parseIpconfig, adapterHeader } from './ipconfigParser'
import { normalizeInput, validateInput, MAX_INPUT_BYTES } from './normalizeInput'
import { detectCommand } from './detectCommand'
import { examples } from '../../fixtures'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'

const normal = examples[0]!.text
const wrap = (fields: string) => `Windows IP Configuration\n\nEthernet adapter Demo:\n${fields}`
const fields =
  '   IPv4 Address . . : 192.0.2.10\n   Subnet Mask . . : 255.255.255.0\n   Default Gateway . . : 192.0.2.1\n   DNS Servers . . : 192.0.2.53'
describe('ipconfig parser', () => {
  it('reads EN and retains line numbers and continuations', () => {
    const parsed = parseIpconfig(normal)
    expect(parsed.status).toBe('ok')
    expect(parsed.value?.adapters).toHaveLength(2)
    const adapter = parsed.value!.adapters[0]!
    expect(adapter).toMatchObject({
      displayName: 'Ethernet',
      dhcpEnabled: true,
      dhcpServer: '192.0.2.2',
      macAddress: '02-00-00-00-00-01',
      dnsSuffix: 'lab.example',
    })
    expect(adapter.ipv4[0]).toMatchObject({
      address: '192.0.2.10',
      prefixLength: 24,
      line: 17,
      maskLine: 18,
    })
    expect(adapter.dnsServers).toEqual([
      { value: '192.0.2.53', line: 21 },
      { value: '192.0.2.54', line: 22 },
    ])
    expect(parsed.value?.computerName).toBe('DEMO-PC')
    expect(parsed.value!.adapters[1]?.mediaState).toBe('disconnected')
  })
  it('reads Russian localized output', () => {
    const p = parseIpconfig(examples[1]!.text)
    expect(p.status).toBe('ok')
    expect(p.value?.adapters[0]?.ipv4[0]?.address).toBe('198.51.100.10')
    expect(p.value?.adapters[1]?.mediaState).toBe('disconnected')
  })
  it.each(['\n', '\r\n', '\r'])('normalizes endings %j', (ending) => {
    expect(parseIpconfig(normal.replace(/\n/g, ending))).toEqual(parseIpconfig(normal))
  })
  it('supports mixed locales and space/dot variations', () => {
    expect(
      parseIpconfig(wrap(fields.replace('Subnet Mask . .', 'Маска подсети...'))).value?.adapters[0]
        ?.ipv4[0]?.prefixLength,
    ).toBe(24)
  })
  it('reads IPv6 gateways and DNS continuations', () => {
    const p = parseIpconfig(examples[3]!.text)
    expect(p.status).toBe('ok')
    expect(p.value?.adapters).toHaveLength(3)
    expect(p.value?.adapters[0]?.gateways[1]?.value).toBe('2001:db8::1')
    expect(p.value?.adapters[2]?.ipv6[0]?.address).toBe('2001:db8:2::8')
  })
  it('retains multiple IPv4 and corresponding masks', () => {
    const p = parseIpconfig(
      wrap(`${fields}\n   IPv4 Address : 192.0.2.20\n   Subnet Mask : 255.255.255.128`),
    )
    expect(p.value?.adapters[0]?.ipv4.map((ip) => ip.prefixLength)).toEqual([24, 25])
  })
  it('reads link-local IPv6 and zone', () => {
    expect(
      parseIpconfig(
        wrap('   Link-local IPv6 Address . : fe80::1%12(Preferred)\n   DNS Servers : 2001:db8::53'),
      ).value?.adapters[0]?.ipv6[0]?.address,
    ).toBe('fe80::1%12')
  })
  it('allows static configuration without DHCP server', () => {
    const p = parseIpconfig(wrap(`${fields}\n   DHCP Enabled : No`))
    expect(p.status).toBe('ok')
    expect(p.value?.adapters[0]?.dhcpEnabled).toBe(false)
  })
  it('returns partial for corrupt IP, masks, unknown fields', () => {
    const p = parseIpconfig(examples[4]!.text)
    expect(p.status).toBe('partial')
    expect(p.value?.adapters[0]?.ipv4).toEqual([])
    expect(p.warnings.map((w) => w.code)).toContain('INVALID_MASK')
  })
  it.each([
    ['   IPv6 Address : g::1', 'INVALID_IPV6'],
    ['   Physical Address : bad', 'INVALID_MAC'],
    ['   DHCP Enabled : Maybe', 'UNKNOWN_DHCP'],
    ['   DHCP Server : bad', 'INVALID_DHCP_SERVER'],
    ['   Subnet Mask : 255.255.255.0', 'ORPHAN_MASK'],
    ['   Default Gateway : bad', 'INVALID_ADDRESS'],
    ['   Some line without a label', 'UNKNOWN_LINE'],
    ['   IPv4 Address : 192.0.2.10', 'MISSING_MASK'],
  ])('warns on %s', (line, code) =>
    expect(parseIpconfig(wrap(line)).warnings.map((w) => w.code)).toContain(code),
  )
  it('ignores empty optional identifiers', () => {
    const p = parseIpconfig(
      wrap(`${fields}\n   Description :\n   DHCP Server :\n   Physical Address :`),
    )
    expect(p.status).toBe('ok')
    expect(p.value?.adapters[0]?.macAddress).toBeUndefined()
  })
  it('returns unsupported and invalid instead of throwing', () => {
    expect(parseIpconfig('hello').status).toBe('unsupported')
    expect(parseIpconfig('   ').status).toBe('invalid')
    expect(parseIpconfig('a\0b').status).toBe('invalid')
  })
  it('retains known host fields with no adapters as partial', () => {
    expect(parseIpconfig('Windows IP Configuration\n   Host Name : DEMO-PC').status).toBe('partial')
  })
  it('does not fabricate adapter from random labels', () => {
    expect(adapterHeader('   IPv4 Address :')).toBeUndefined()
    expect(adapterHeader('Unknown:')).toBeUndefined()
    expect(adapterHeader('Ethernet adapter :')).toBeUndefined()
  })
  it('supports tunnel headers', () => {
    expect(adapterHeader('Туннельный адаптер Demo:')).toBe('Demo')
    expect(adapterHeader('Tunnel adapter Demo:')).toBe('Demo')
  })
  it('accepts indented adapter headers without confusing field values with headers', () => {
    const text = wrap(fields).replace('Ethernet adapter Demo:', '  Ethernet adapter Demo:')
    const parsed = parseIpconfig(text + '\n   Description : Ethernet adapter Demo:')
    expect(parsed.value?.adapters).toHaveLength(1)
    expect(parsed.value?.adapters[0]?.fieldLines.header).toEqual([3])
  })
  it('cites the adapter header when the virtual-interface hypothesis comes from its name', () => {
    const text = wrap(fields).replace('Ethernet adapter Demo:', 'Tunnel adapter VPN-Demo:')
    const finding = analyzeOutput(text).findings.find((item) => item.ruleId === 'NET-007')
    expect(finding?.evidence.some((item) => item.range.startLine === 3)).toBe(true)
  })
  it('allows blank continuation but rejects unsupported entries', () => {
    const p = parseIpconfig(
      wrap(`${fields}\n\n                               2001:db8::54\n   DHCP Enabled : Yes`),
    )
    expect(p.value?.adapters[0]?.dnsServers).toHaveLength(2)
  })
  it('preserves raw text exactly apart from BOM and endings', () => {
    expect(normalizeInput('\uFEFF a\r\nb \r c')).toBe(' a\nb \n c')
  })
  it('limits size and binary/control inputs', () => {
    expect(validateInput('a'.repeat(MAX_INPUT_BYTES + 1))).toContain('2 MiB')
    expect(validateInput('x\x01')).toContain('бинарные')
    expect(validateInput('x\n'.repeat(50_001))).toContain('50 000')
  })
})
describe('detector and use case', () => {
  it('recognizes strong and weak ipconfig signals', () => {
    expect(detectCommand(normal).confidence).toBe('high')
    expect(detectCommand(fields).confidence).toBe('medium')
    expect(detectCommand('hello').kind).toBe('unknown')
  })
  it('supports manual parsing without header', () => {
    expect(analyzeOutput(`Ethernet adapter Demo:\n${fields}`, 'ipconfig').parse.status).toBe('ok')
    expect(analyzeOutput('hello').parse.status).toBe('unsupported')
  })
  it('is deterministic with explicit time', () => {
    expect(analyzeOutput(normal, 'auto', '2026-10-09T12:00:00Z')).toEqual(
      analyzeOutput(normal, 'auto', '2026-10-09T12:00:00Z'),
    )
  })
  it('rejects empty input', () => expect(analyzeOutput('').parse.status).toBe('invalid'))
})
