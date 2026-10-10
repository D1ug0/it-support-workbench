import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseDnsRecords, parsePowerShell } from './extendedParsers'
import { detectCommand } from './detectCommand'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'
import { redactReport } from '../export/exportReport'
const fixture = (name: string) => readFileSync(`src/fixtures/${name}`, 'utf8')
const mx = { Name: 'secret.example', Type: 15, NameExchange: 'mail.secret.example', Preference: 10 }
const tcp = { RemoteAddress: '10.20.30.40', RemotePort: 443, TcpTestSucceeded: false }
describe('typed DNS and PowerShell', () => {
  it.each([
    'dns-mx-en.txt',
    'dns-srv-en.txt',
    'dns-srv-ru.txt',
    'dns-txt-ru.txt',
    'powershell-dns.json',
  ])('detects and analyzes %s', (file) => {
    const result = analyzeOutput(fixture(file))
    expect(result.parse.status).toBe('ok')
    expect(result.parse.kind).toBe('dns-records')
    expect(result.findings.length).toBeGreaterThan(0)
  })
  it.each(['powershell-tcp.json', 'powershell-ip.json'])('detects and analyzes %s', (file) => {
    const result = analyzeOutput(fixture(file))
    expect(result.parse.status).toBe('ok')
    expect(result.parse.kind).toBe('powershell')
    expect(result.findings.length).toBeGreaterThan(0)
  })
  it('retains MX preference, SRV transport and TXT segment content', () => {
    expect(
      parseDnsRecords(fixture('dns-mx-en.txt')).value?.records.map((r) => r.preference),
    ).toEqual([10, 20])
    expect(parseDnsRecords(fixture('dns-srv-ru.txt')).value?.records[0]).toMatchObject({
      type: 'SRV',
      priority: 0,
      weight: 100,
      port: 389,
      target: 'dc-a.lab.example',
      line: 4,
    })
    expect(parseDnsRecords(fixture('dns-txt-ru.txt')).value?.records[0]?.text?.join('')).toBe(
      'v=spf1 -all',
    )
  })
  it('accepts all six DNS types without accepting mismatched address families', () => {
    const rows = [
      { Name: 'lab.example', Type: 1, IPAddress: '192.0.2.1' },
      { Name: 'lab.example', Type: 28, IPAddress: '2001:db8::1' },
      { Name: 'lab.example', Type: 5, NameHost: 'alias.lab.example' },
      mx,
      { Name: 'lab.example', Type: 16, Strings: ['a', 'b'] },
      { Name: '_a._tcp.lab.example', Type: 33, NameTarget: '.', Priority: 0, Weight: 0, Port: 0 },
    ]
    expect(parseDnsRecords(JSON.stringify(rows)).value?.records.map((r) => r.type)).toEqual([
      'A',
      'AAAA',
      'CNAME',
      'MX',
      'TXT',
      'SRV',
    ])
    expect(parseDnsRecords(JSON.stringify({ ...rows[0], IPAddress: '::1' })).status).toBe(
      'unsupported',
    )
  })
  it('skips invalid records with physical line evidence and retains valid ones', () => {
    const text =
      '[\n' +
      JSON.stringify({ ...mx, Preference: -1 }) +
      ',\n' +
      JSON.stringify({ ...mx, TTL: 30, Section: 'Answer' }) +
      '\n]'
    const result = parseDnsRecords(text)
    expect(result.status).toBe('partial')
    expect(result.warnings[0]?.range).toEqual({ startLine: 2, endLine: 2 })
    expect(result.value?.records[0]).toMatchObject({ line: 3, ttl: 30, section: 'answer' })
  })
  it.each([
    { ...mx, Preference: 65536 },
    { ...mx, TTL: -1 },
    { ...mx, Section: 'Bogus' },
    { ...mx, Name: 'bad name' },
    { Name: 'lab.example', Type: 16, Strings: [2] },
    { Name: 'lab.example', Type: 16, Strings: ['x'.repeat(8193)] },
    { ...mx, Type: 99 },
  ])('rejects incomplete/out-of-range DNS %j', (row) =>
    expect(parseDnsRecords(JSON.stringify(row)).status).toBe('unsupported'),
  )
  it('does not fabricate incomplete textual SRV/TXT records', () => {
    expect(
      parseDnsRecords('_x._tcp.lab.example SRV service location:\n priority = 0\n port = 389')
        .status,
    ).toBe('unsupported')
    expect(parseDnsRecords('lab.example text =').status).toBe('unsupported')
    expect(
      parseDnsRecords('lab.example MX preference = 999999, mail exchanger = mail.lab.example')
        .status,
    ).toBe('unsupported')
  })
  it('invalid JSON, mixed JSON commands and oversized input are handled safely', () => {
    for (const text of ['{oops', '[]', '42', '[null]']) {
      expect(parsePowerShell(text).status).not.toBe('ok')
      expect(parseDnsRecords(text).status).not.toBe('ok')
    }
    expect(detectCommand(JSON.stringify([mx, tcp])).kind).toBe('unknown')
    expect(parseDnsRecords('x'.repeat(2 * 1024 * 1024 + 1)).status).toBe('invalid')
    expect(parsePowerShell('{}\n'.repeat(50001)).status).toBe('invalid')
  })
  it('native nested addresses retain lines despite nested objects and escaped braces', () => {
    const result = parsePowerShell(
      '[\n' +
        JSON.stringify({
          InterfaceIndex: 1,
          InterfaceAlias: 'test {"}',
          IPv4Address: [{ IPAddress: '192.0.2.1' }],
          DNSServer: { ServerAddresses: ['192.0.2.53'] },
        }) +
        ',\n' +
        JSON.stringify({ InterfaceIndex: 2, InterfaceAlias: 'b', IPv4Address: [] }) +
        '\n]',
    )
    expect(result.status).toBe('ok')
    if (result.value?.cmdlet === 'Get-NetIPConfiguration') {
      expect(result.value.interfaces.map((i) => i.line)).toEqual([2, 3])
      expect(result.value.interfaces[0]?.dns).toEqual(['192.0.2.53'])
    } else throw new Error('wrong cmdlet')
  })
  it.each([
    { ...tcp, TcpTestSucceeded: 'False' },
    { ...tcp, RemotePort: 0 },
    { ...tcp, RemotePort: 65536 },
    { ...tcp, SourceAddress: 'bad' },
    { ...tcp, RemoteAddress: 'bad' },
    { ...tcp, ComputerName: 'bad name' },
  ])('rejects invalid TCP data %j', (value) =>
    expect(parsePowerShell(JSON.stringify(value)).status).toBe('invalid'),
  )
  it('uses booleans and optional nested source addresses', () => {
    const result = parsePowerShell(
      JSON.stringify({ ...tcp, SourceAddress: { IPAddressToString: '192.0.2.10' } }),
    )
    expect(result.value).toMatchObject({
      cmdlet: 'Test-NetConnection',
      connection: { tcpSucceeded: false, sourceAddress: '192.0.2.10' },
    })
    expect(parsePowerShell(JSON.stringify([tcp, tcp])).status).toBe('invalid')
  })
  it('accepts literal IPv6 TCP targets without revealing them in report', () => {
    const result = analyzeOutput(
      JSON.stringify({ ...tcp, ComputerName: 'fd12:abcd::20', RemoteAddress: 'fd12:abcd::20' }),
    )
    expect(result.parse.status).toBe('ok')
    expect(redactReport(result)).not.toContain('fd12:abcd::20')
  })
  it('partial interfaces do not silently drop an invalid address', () => {
    const result = parsePowerShell(
      JSON.stringify([
        { InterfaceIndex: 1, InterfaceAlias: 'bad', IPv4Address: ['192.0.2.10', 'bad'] },
        { InterfaceIndex: 2, InterfaceAlias: 'ok', IPv4Address: [], IPv6Address: ['::1'] },
      ]),
    )
    expect(result.status).toBe('partial')
    if (result.value?.cmdlet === 'Get-NetIPConfiguration')
      expect(result.value.interfaces.map((i) => i.index)).toEqual([2])
  })
  it('redacted reports never expose domain, TXT, interface aliases or private IP', () => {
    for (const text of [
      JSON.stringify([mx, { Name: 'secret.example', Type: 16, Strings: ['PRIVATE-TXT'] }]),
      JSON.stringify({ ...tcp, ComputerName: 'private.example', InterfaceAlias: 'PRIVATE-ALIAS' }),
    ]) {
      const report = redactReport(analyzeOutput(text))
      for (const secret of [
        'secret.example',
        'PRIVATE-TXT',
        'private.example',
        'PRIVATE-ALIAS',
        '10.20.30.40',
      ])
        expect(report).not.toContain(secret)
    }
    expect(analyzeOutput(JSON.stringify(tcp)).findings[0]?.whatItDoesNotProve).toContain('TLS')
  })
})
