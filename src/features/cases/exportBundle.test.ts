import { it, expect } from 'vitest'
import { createCaseExports } from './exportBundle'
import { CASE_BUNDLE_MAX_BYTES, CASE_BUNDLE_MAX_CASES, parseCaseBundle } from './schema'
import type { LocalCase } from './schema'

const makeCase = (report = 'Диагностика'): LocalCase => ({
  id: globalThis.crypto.randomUUID(),
  title: 'Demo',
  command: 'ping',
  createdAt: '2026-10-09T12:00:00Z',
  report,
})

it('partitions by record count even when all cases fit within the byte budget', () => {
  const cases = Array.from({ length: CASE_BUNDLE_MAX_CASES + 1 }, () => makeCase())
  const before = structuredClone(cases)
  const parts = createCaseExports(cases)
  expect(parts.map((part) => part.count)).toEqual([CASE_BUNDLE_MAX_CASES, 1])
  expect(parts.map((part) => part.name)).toEqual([
    'workbench-cases-1-of-2.json',
    'workbench-cases-2-of-2.json',
  ])
  expect(parts.flatMap((part) => parseCaseBundle(part.text))).toEqual(cases)
  expect(cases).toEqual(before)
})

it('preserves the JSON layout and counts escaped and multibyte text exactly at the limit', () => {
  const cases = Array.from({ length: 4 }, () => makeCase('x'.repeat(500_000)))
  cases.push(makeCase('я😀"\\\n'))
  const originalBytes = new TextEncoder().encode(createCaseExports(cases)[0]!.text).length
  cases[4]!.report += 'x'.repeat(CASE_BUNDLE_MAX_BYTES - originalBytes)
  expect(new TextEncoder().encode(createCaseExports(cases)[0]!.text).length).toBe(
    CASE_BUNDLE_MAX_BYTES,
  )
  cases.push(makeCase())
  const parts = createCaseExports(cases)
  expect(parts).toHaveLength(2)
  for (const part of parts) {
    const decoded = parseCaseBundle(part.text)
    expect(part.text).toBe(JSON.stringify({ schemaVersion: 1, cases: decoded }, null, 2))
    expect(new TextEncoder().encode(part.text).length).toBeLessThanOrEqual(CASE_BUNDLE_MAX_BYTES)
  }
  expect(parts.flatMap((part) => parseCaseBundle(part.text))).toEqual(cases)
})
it('partitions a large archive into importable JSON parts without losing cases', () => {
  const cases = Array.from({ length: 10 }, (_, i) => ({
    id: globalThis.crypto.randomUUID(),
    title: `Demo ${i}`,
    command: 'ping' as const,
    createdAt: '2026-10-09T12:00:00Z',
    report: 'Я'.repeat(500_000),
  }))
  const parts = createCaseExports(cases)
  expect(parts.length).toBeGreaterThan(1)
  for (const part of parts)
    expect(new TextEncoder().encode(part.text).length).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(parts.flatMap((part) => parseCaseBundle(part.text))).toEqual(cases)
})
it('exports an empty archive and refuses a single non-importable record', () => {
  expect(parseCaseBundle(createCaseExports([])[0]!.text)).toEqual([])
  expect(() =>
    createCaseExports([
      {
        id: globalThis.crypto.randomUUID(),
        title: 'Demo',
        command: 'ping',
        createdAt: '2026-10-09T12:00:00Z',
        report: '\x01'.repeat(500_000),
      },
    ]),
  ).toThrow('слишком велик')
})
