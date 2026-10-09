import { it, expect } from 'vitest'
import { createCaseExports } from './exportBundle'
import { parseCaseBundle } from './schema'
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
