import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { examples, outputExamples } from '../../fixtures'
import {
  analyzeSession,
  compareOutputs,
  canonicalAddress,
  targetAddress,
  exportSession,
  formatDifference,
} from './session'
import type { SessionRecord } from './session'
import { useSessionStore } from './useSessionStore'
const record = (text: string, id: string, time = '2026-10-09T12:00:00Z'): SessionRecord => ({
  id,
  label: 'PRIVATE LABEL',
  observedAt: time,
  analysis: analyzeOutput(text, 'auto', time),
  source: text,
})
const fixture = (kind: string) =>
  outputExamples.find((e) => e.id === kind)?.text ??
  outputExamples.find((e) => e.name.toLowerCase().startsWith(kind))!.text
describe('explicitly grouped evidence', () => {
  it.each([
    ['2001:db8::1', '2001:db8:0:0:0:0:0:1'],
    ['::ffff:192.0.2.1', '0:0:0:0:0:ffff:c000:201'],
    ['fe80::1%12', 'fe80:0:0:0:0:0:0:1%12'],
    ['192.0.2.1', '192.0.2.1'],
    ['hello', 'hello'],
  ])('canonicalizes %s', (value, wanted) => expect(canonicalAddress(value)).toBe(wanted))
  it('correlates configured DNS, DNS answer and ICMP target without claiming causality', () => {
    const result = analyzeSession([
      record(examples[0]!.text, 'config'),
      record(fixture('nslookup'), 'dns'),
      record(fixture('ping'), 'icmp'),
    ])
    expect(result.map((r) => r.id)).toEqual(['SESSION-DNS-001', 'SESSION-TARGET-001'])
    expect(result[0]?.title).toContain('из конфигурации')
    expect(result[1]?.title).toContain('присутствует')
    expect(result[0]?.references[0]?.range?.startLine).toBeGreaterThan(0)
    expect(result[1]?.limitation).toContain('TCP')
  })
  it('uses latest timestamps rather than insertion order and warns about separated checks', () => {
    const result = analyzeSession([
      record(
        fixture('nslookup').replace('192.0.2.53', '192.0.2.99'),
        'late',
        '2026-10-09T13:00:00Z',
      ),
      record(examples[0]!.text, 'config'),
      record(fixture('nslookup'), 'early'),
    ])
    expect(result[0]?.title).toContain('другой')
    expect(result[0]?.references[1]?.recordId).toBe('late')
    expect(result.at(-1)?.id).toBe('SESSION-TIME-001')
  })
  it('keeps absent evidence unknown', () => {
    expect(analyzeSession([])).toEqual([])
    expect(analyzeSession([record(fixture('nslookup'), 'dns')])).toEqual([])
    expect(targetAddress('example.com')).toBeUndefined()
    expect(targetAddress('example.com [192.0.2.20]')).toBe('192.0.2.20')
  })
  it('compares IPv4, prefix, DNS and interface state while ignoring DNS order', () => {
    const original = analyzeOutput(examples[0]!.text).parse.value!
    const same = structuredClone(original)
    if (same.kind === 'ipconfig') same.adapters[0]!.dnsServers.reverse()
    expect(compareOutputs(original, same)).toEqual([])
    const changed = analyzeOutput(
      examples[0]!.text
        .replaceAll('192.0.2.10', '192.0.2.11')
        .replaceAll('192.0.2.53', '192.0.2.55')
        .replaceAll('255.255.255.0', '255.255.255.128'),
    ).parse.value!
    expect(compareOutputs(original, changed).map((d) => d.field)).toEqual(
      expect.arrayContaining(['IPv4 / префикс', 'DNS']),
    )
  })
  it('does not pair duplicate adapter names', () => {
    const original = analyzeOutput(examples[0]!.text).parse.value!
    const duplicate = structuredClone(original)
    if (duplicate.kind === 'ipconfig')
      duplicate.adapters.push(structuredClone(duplicate.adapters[0]!))
    expect(compareOutputs(original, duplicate).map((d) => d.field)).toContain(
      'Неоднозначное имя — поля не сопоставлены',
    )
  })
  it.each(['ping', 'nslookup', 'tracert', 'route'])(
    'compares %s and detects changed fields',
    (kind) => {
      const original = analyzeOutput(fixture(kind)).parse.value!
      const changed = structuredClone(original)
      if (changed.kind === 'ping') changed.average = 99
      if (changed.kind === 'nslookup') changed.outcome = 'nxdomain'
      if (changed.kind === 'tracert') changed.completed = false
      if (changed.kind === 'route') changed.ipv4Routes[0]!.metric = 99
      expect(compareOutputs(original, changed).length).toBeGreaterThan(0)
    },
  )
  it('retains route associations when two gateways are swapped', () => {
    const original = analyzeOutput(fixture('route')).parse.value!
    const changed = structuredClone(original)
    if (changed.kind === 'route') {
      const first = changed.ipv4Routes[0]!,
        second = changed.ipv4Routes[1]!
      ;[first.gateway, second.gateway] = [second.gateway, first.gateway]
    }
    expect(compareOutputs(original, changed).length).toBeGreaterThan(0)
  })
  it('detects traceroute target and per-hop timing changes without losing less-than or timeout', () => {
    const original = analyzeOutput(fixture('tracert')).parse.value!
    if (original.kind !== 'tracert') throw new Error('Invalid fixture')
    const changed = structuredClone(original)
    changed.target = 'private-host.internal'
    changed.targetAddress = '10.42.0.20'
    changed.hops[0]!.times = [1, null, 20]
    changed.hops[0]!.lessThan = [true, false, false]
    const diff = compareOutputs(original, changed)
    expect(diff.map((d) => d.field)).toEqual(
      expect.arrayContaining(['Цель запроса', 'Адрес цели', 'RTT и отсутствие ответов по хопам']),
    )
    const timing = diff.find((d) => d.field === 'RTT и отсутствие ответов по хопам')!
    expect(formatDifference(timing.after)).toContain('<1 ms / * / 20 ms')
    const report = exportSession([record(fixture('tracert'), 'a')], [], diff)
    expect(report).not.toContain('private-host.internal')
    expect(report).not.toContain('10.42.0.20')
  })
  it('rejects different command models', () =>
    expect(() =>
      compareOutputs(
        analyzeOutput(fixture('ping')).parse.value!,
        analyzeOutput(fixture('route')).parse.value!,
      ),
    ).toThrow('одной команды'))
  it('exports redacted evidence and differences without original names or private IP', () => {
    const a = record(examples[0]!.text.replaceAll('192.0.2.', '10.42.0.'), 'a')
    const b = record(a.source.replaceAll('10.42.0.10', '10.42.0.20'), 'b')
    const differences = compareOutputs(a.analysis.parse.value!, b.analysis.parse.value!)
    const report = exportSession([a, b], analyzeSession([a, b]), differences, {
      beforeId: 'a',
      afterId: 'b',
    })
    expect(report).not.toContain('10.42.0.')
    expect(report).not.toContain('PRIVATE LABEL')
    expect(report).not.toContain('DEMO-PC')
    expect(report).toContain('IPv4 1')
    expect(report).toContain('До: проверка 1. После: проверка 2.')
    expect(formatDifference([], undefined, true)).toBe('Отсутствует')
    expect(formatDifference([{ value: 'secret', sensitive: true }])).toBe('Скрыто')
  })
  it('does not export ambiguous comparison references', () => {
    const a = record(examples[0]!.text, 'a')
    expect(exportSession([a], [])).toContain('Пара проверок для сравнения не указана.')
    for (const afterId of ['a', 'missing'])
      expect(() => exportSession([a], [], [], { beforeId: 'a', afterId })).toThrow('две разные')
  })
  it('requires explicit context and caps memory/session size', () => {
    setActivePinia(createPinia())
    const store = useSessionStore()
    const result = analyzeOutput(examples[0]!.text)
    expect(() => store.add(result, 'text', 'check', '2026-10-09T12:00:00Z')).toThrow('создайте')
    expect(() => store.start('demo', 'PC', false)).toThrow('подтвердите')
    store.start('demo', 'PC', true)
    expect(() => store.add(result, 'text', 'check', 'bad')).toThrow('время')
    expect(() =>
      store.add(result, 'a'.repeat(4 * 1024 * 1024 + 1), 'check', '2026-10-09T12:00:00Z'),
    ).toThrow('4 MiB')
    for (let i = 0; i < 20; i++) store.add(result, 'text', 'check', '2026-10-09T12:00:00Z')
    expect(() => store.add(result, 'text', 'check', '2026-10-09T12:00:00Z')).toThrow('20')
    expect(() => store.start('new', 'PC', true)).toThrow('Очистите'.toLowerCase())
    store.remove(store.records[0]!.id)
    expect(store.records).toHaveLength(19)
    store.clear()
    expect(store.active).toBe(false)
  })
})
