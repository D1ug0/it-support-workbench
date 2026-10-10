import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { setActivePinia, createPinia } from 'pinia'
import {
  createArchive,
  restoreArchive,
  archiveJson,
  parseArchive,
  mergeArchives,
  archiveSchema,
} from './archive'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { compareOutputs, analyzeSession, type SessionRecord } from './session'
import { useSessionStore } from './useSessionStore'
import { redactReport } from '../../infrastructure/export/exportReport'
const fixture = (file: string) => readFileSync(`src/fixtures/${file}`, 'utf8')
function record(text: string): SessionRecord {
  return {
    id: crypto.randomUUID(),
    label: 'PRIVATE LABEL',
    source: text,
    observedAt: '2026-10-10T10:00:00.000Z',
    analysis: analyzeOutput(text),
  }
}
const files = [
  'ipconfig-en-normal.txt',
  'ping-en.txt',
  'nslookup-en.txt',
  'tracert-en.txt',
  'route-en.txt',
  'powershell-dns.json',
  'powershell-tcp.json',
  'powershell-ip.json',
]
beforeEach(() => setActivePinia(createPinia()))
describe('anonymized structured session archives', () => {
  it.each(files)('round trips %s without source, identifiers or private IP', (file) => {
    const text = fixture(file)
      .replaceAll('192.0.2.', '10.42.0.')
      .replaceAll('2001:db8:', 'fd12:abcd:')
      .replaceAll('lab.example', 'private.example')
    const input = record(text)
    const before = JSON.stringify(input)
    const archive = createArchive([input])
    const json = archiveJson(archive)
    for (const secret of [
      '10.42.0.',
      'fd12:abcd:',
      'private.example',
      'PRIVATE LABEL',
      '"source"',
      'DEMO-PC',
      'macAddress',
      'dnsSuffix',
    ])
      expect(json).not.toContain(secret)
    const restored = restoreArchive(parseArchive(json))
    expect(restored[0]?.source).toBe('')
    expect(restored[0]?.analysis.parse.value?.kind).toBe(input.analysis.parse.kind)
    expect(restored[0]?.analysis.findings).toEqual([])
    expect(JSON.stringify(input)).toBe(before)
  })
  it('retains documentation addresses and masks unknown private values once across records', () => {
    const a = record(fixture('ipconfig-en-normal.txt').replaceAll('192.0.2.', '10.42.0.'))
    const b = record(fixture('nslookup-en.txt').replaceAll('192.0.2.', '10.42.0.'))
    const c = record(fixture('ping-en.txt').replaceAll('192.0.2.', '10.42.0.'))
    const before = analyzeSession([a, b, c])
    const restored = restoreArchive(createArchive([a, b, c]))
    expect(analyzeSession(restored)).toEqual(before)
    expect(archiveJson(createArchive([record(fixture('powershell-tcp.json'))]))).toContain(
      '192.0.2.',
    )
    const json = archiveJson(createArchive([a, b, c]))
    expect(json).toContain('[IPv4')
    expect(redactReport(restored[0]!.analysis)).toContain('[IPv4')
  })
  it('retains change relationships after redaction and hides distinct TXT segments', () => {
    const a = record(JSON.stringify({ Name: 'internal.example', Type: 16, Strings: ['secret-A'] }))
    const b = record(JSON.stringify({ Name: 'internal.example', Type: 16, Strings: ['secret-B'] }))
    const archive = createArchive([a, b])
    const restored = restoreArchive(archive)
    const diffs = compareOutputs(
      restored[0]!.analysis.parse.value!,
      restored[1]!.analysis.parse.value!,
    )
    expect(diffs).toHaveLength(1)
    expect(archiveJson(archive)).not.toContain('secret-')
    expect(archiveJson(archive)).toContain('[Текст 1 скрыт]')
    expect(archiveJson(archive)).toContain('[Текст 2 скрыт]')
  })
  it('whitelists all persisted fields and rejects raw text/private addresses injected during import', () => {
    const archive = createArchive([record(fixture('powershell-tcp.json'))])
    for (const value of [
      { ...archive, source: 'PRIVATE' },
      { ...archive, records: [{ ...archive.records[0], label: 'PRIVATE' }] },
      {
        ...archive,
        records: [
          { ...archive.records[0], model: { kind: 'ping', target: '10.0.0.1', replies: [] } },
        ],
      },
      { ...archive, schemaVersion: 2 },
      { ...archive, records: [archive.records[0], archive.records[0]] },
      { ...archive, records: [] },
    ])
      expect(() => parseArchive(JSON.stringify(value))).toThrow()
  })
  it('rejects malformed, oversized, missing typed record fields and invalid masks', () => {
    expect(() => parseArchive('{')).toThrow()
    expect(() => parseArchive('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MiB')
    const a = createArchive([record(fixture('ipconfig-en-normal.txt'))])
    const model = a.records[0]!.model
    if (model.kind === 'ipconfig') {
      model.adapters[0]!.ipv4[0]!.mask = '10.0.0.1'
      expect(archiveSchema.safeParse(a).success).toBe(false)
    }
    const dns = createArchive([record(fixture('powershell-dns.json'))])
    if (dns.records[0]!.model.kind === 'dns-records') {
      delete dns.records[0]!.model.records[0]!.preference
      expect(archiveSchema.safeParse(dns).success).toBe(false)
    }
  })
  it('masks IPv6 scope names even on documentation networks and rejects importing them', () => {
    const a = record(
      JSON.stringify({
        RemoteAddress: '2001:db8::20%PRIVATE-VPN',
        RemotePort: 443,
        TcpTestSucceeded: true,
      }),
    )
    const archive = createArchive([a])
    expect(archiveJson(archive)).not.toContain('PRIVATE-VPN')
    expect(redactReport(a.analysis)).not.toContain('PRIVATE-VPN')
    if (
      archive.records[0]!.model.kind === 'powershell' &&
      archive.records[0]!.model.cmdlet === 'Test-NetConnection'
    ) {
      archive.records[0]!.model.connection.remoteAddress = '2001:db8::20%PRIVATE-VPN'
      expect(archiveSchema.safeParse(archive).success).toBe(false)
    }
  })
  it('caps archived record count and repository quota; same ID updates keep one archive', () => {
    const a = createArchive([record(fixture('ping-en.txt'))])
    expect(mergeArchives([a], a)).toHaveLength(1)
    expect(() =>
      mergeArchives(
        Array.from({ length: 20 }, () => createArchive([record(fixture('ping-en.txt'))])),
        a,
      ),
    ).toThrow('20')
    expect(() => createArchive([])).toThrow()
    expect(() =>
      createArchive(Array.from({ length: 21 }, () => record(fixture('ping-en.txt')))),
    ).toThrow()
  })
  it('restores a read session and prevents mixing unknown original addresses with new measurements', () => {
    const session = useSessionStore()
    const a = record(fixture('powershell-tcp.json'))
    session.restore(createArchive([a]))
    expect(session.active).toBe(true)
    expect(session.restored).toBe(true)
    expect(session.records[0]?.source).toBe('')
    expect(() => session.add(a.analysis, a.source, 'New', a.observedAt)).toThrow('Архив')
    session.clear()
    expect(session.restored).toBe(false)
    session.start('New', 'Lab PC', true)
    session.add(a.analysis, a.source, 'New', a.observedAt)
    expect(session.records).toHaveLength(1)
  })
  it('compares TCP result changes and interface contents ignoring address/record ordering', () => {
    const a = analyzeOutput(fixture('powershell-tcp.json')).parse.value!
    const b = analyzeOutput(fixture('powershell-tcp.json').replace('true', 'false')).parse.value!
    expect(compareOutputs(a, b).map((d) => d.field)).toEqual(['TCP-проверка'])
    const interfaces = analyzeOutput(fixture('powershell-ip.json')).parse.value!
    expect(compareOutputs(interfaces, structuredClone(interfaces))).toEqual([])
    if (interfaces.kind === 'powershell' && interfaces.cmdlet === 'Get-NetIPConfiguration') {
      const after = structuredClone(interfaces)
      after.interfaces[0]!.dns.push('192.0.2.54')
      expect(compareOutputs(interfaces, after).map((d) => d.field)).toContain(
        'Интерфейсы и связанные адреса (имена скрыты)',
      )
    }
  })
  it('correlates typed DNS with TCP without claiming TLS availability', () => {
    const dns = record(JSON.stringify({ Name: 'lab.example', Type: 1, IPAddress: '192.0.2.20' })),
      tcp = record(fixture('powershell-tcp.json'))
    const obs = analyzeSession([dns, tcp])
    expect(obs.find((o) => o.id === 'SESSION-TCP-DNS-001')?.title).toContain('присутствует')
    expect(obs.find((o) => o.id === 'SESSION-TCP-DNS-001')?.limitation).toContain('TLS')
    expect(analyzeSession(restoreArchive(createArchive([dns, tcp])))).toEqual(obs)
  })
})
