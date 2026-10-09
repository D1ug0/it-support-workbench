import { describe, it, expect } from 'vitest'
import { parseCaseBundle, caseSchema } from './schema'
const sample = {
  id: 'ea588d39-884b-4a4d-b6b1-671ade1e908c',
  title: 'Учебный кейс',
  command: 'ipconfig',
  createdAt: '2026-10-09T12:00:00Z',
  report: '# Safe report',
}
describe('local case schema', () => {
  it('validates versioned export', () =>
    expect(parseCaseBundle(JSON.stringify({ schemaVersion: 1, cases: [sample] }))).toHaveLength(1))
  it('rejects invalid JSON, versions, arbitrary fields and oversized files', () => {
    expect(() => parseCaseBundle('bad')).toThrow('JSON')
    expect(() => parseCaseBundle(JSON.stringify({ schemaVersion: 2, cases: [] }))).toThrow(
      'schemaVersion',
    )
    expect(caseSchema.safeParse({ ...sample, raw: 'secret' }).success).toBe(false)
    expect(() => parseCaseBundle('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2 MiB')
  })
  it('rejects duplicate IDs and invalid timestamps', () => {
    expect(() =>
      parseCaseBundle(JSON.stringify({ schemaVersion: 1, cases: [sample, sample] })),
    ).toThrow()
    expect(caseSchema.safeParse({ ...sample, createdAt: 'yesterday' }).success).toBe(false)
  })
})
