import { describe, it, expect } from 'vitest'
import { explainResult } from './explainResult'
import { analyzeOutput } from './analyzeOutput'
import { outputExamples } from '../../../fixtures'
import type { AnalysisResult, DiagnosticFinding } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
const result = (value: ParsedOutput): AnalysisResult<ParsedOutput> => ({
  schemaVersion: 1,
  parserVersion: 'test',
  createdAt: '2026-10-09T12:00:00Z',
  parse: { status: 'ok', kind: value.kind, value, warnings: [] },
  findings: [],
})
describe('plain explanations grounded in parsed output', () => {
  it('handles all fixture types without revealing identifying values and links valid evidence', () => {
    for (const example of outputExamples) {
      const summary = explainResult(analyzeOutput(example.text))
      expect(summary.facts.length).toBeGreaterThan(0)
      expect(summary.facts.length).toBeLessThanOrEqual(3)
      expect(summary.limitation.length).toBeGreaterThan(30)
      expect(summary.next.why.length).toBeGreaterThan(15)
      const text = JSON.stringify(summary)
      expect(text).not.toContain('DEMO-PC')
      expect(text).not.toContain('02-00-00-00-00-01')
      for (const fact of summary.facts)
        if (fact.range) {
          expect(fact.range.startLine).toBeGreaterThan(0)
          expect(fact.range.endLine).toBeLessThanOrEqual(example.text.split('\n').length)
        }
    }
  })
  it.each(['', 'arbitrary text'])(
    'does not invent facts for invalid or unsupported output',
    (text) => {
      const summary = explainResult(analyzeOutput(text))
      expect(summary.facts).toEqual([])
      expect(summary.headline).toContain('недостаточно данных')
      expect(summary.next.command).toBeUndefined()
    },
  )
  it('distinguishes unreachable messages from Echo Reply without inferring an application failure', () => {
    const summary = explainResult(
      result({
        kind: 'ping',
        replies: [
          { line: 1, outcome: 'unreachable' },
          { line: 2, outcome: 'timeout' },
        ],
      }),
    )
    expect(summary.headline).toContain('Echo Reply')
    expect(summary.facts[0]?.text).toContain('Echo Reply: 0')
    expect(summary.facts[0]?.text).toContain('недоступности: 1')
    expect(summary.limitation).toContain('фильтрацией')
    expect(summary.next.command).toContain('Test-NetConnection')
  })
  it.each(['answer', 'timeout', 'nxdomain', 'servfail', 'unknown'] as const)(
    'describes DNS outcome %s without treating the server address as an answer',
    (outcome) => {
      const summary = explainResult(
        result({
          kind: 'nslookup',
          outcome,
          serverAddress: '192.0.2.53',
          addresses: [],
          eventLines: [2],
        }),
      )
      expect(summary.facts[0]?.text).toContain('Адресов в ответе: 0')
      expect(summary.facts[0]?.text).toContain('Адрес сервера: найден')
      expect(summary.limitation).toContain('не исправность сайта')
      expect(JSON.stringify(summary)).not.toContain('192.0.2.53')
    },
  )
  it('handles missing DNS metadata, empty routes and trace completion without inventing evidence', () => {
    expect(
      explainResult(result({ kind: 'nslookup', outcome: 'unknown', addresses: [], eventLines: [] }))
        .facts[0]?.range,
    ).toBeUndefined()
    expect(
      explainResult(result({ kind: 'route', ipv4Routes: [], ipv6Routes: [] })).facts[0]?.text,
    ).toContain('IPv4-маршрутов: 0')
    const trace = explainResult(result({ kind: 'tracert', hops: [], completed: true }))
    expect(trace.facts[0]?.text).toContain('завершения: есть')
    expect(trace.limitation).toContain('не подтверждает достижение')
  })
  it('selects the highest-priority observation and its actual next check without mutating order', () => {
    const analysis = result({ kind: 'ping', replies: [] })
    const finding: DiagnosticFinding = {
      id: 'demo',
      ruleId: 'TEST',
      severity: 'critical',
      confidence: 'high',
      title: 'Проверяемый признак',
      explanation: 'Пояснение наблюдаемого признака.',
      whatItDoesNotProve: 'Причина не доказана.',
      evidence: [{ range: { startLine: 1, endLine: 1 } }],
      nextChecks: [
        {
          label: 'Следующая проверка',
          why: 'Чтобы сопоставить результат.',
          safeReadOnlyCommand: 'ipconfig /all',
        },
      ],
    }
    analysis.findings = [
      { ...finding, severity: 'info' },
      { ...finding, severity: 'warning' },
      finding,
    ]
    const before = [...analysis.findings]
    const summary = explainResult(analysis)
    expect(summary.facts[0]?.label).toBe(finding.title)
    expect(summary.next.command).toBe('ipconfig /all')
    expect(analysis.findings).toEqual(before)
    analysis.findings = [{ ...finding, evidence: [], nextChecks: [] }]
    expect(explainResult(analysis).next.command).toContain('Test-NetConnection')
  })
})
