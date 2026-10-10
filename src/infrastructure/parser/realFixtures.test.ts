import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { realFixtureManifestSchema, assertFixturePrivacy } from './realFixtureManifest'
import { analyzeOutput } from '../../features/network-analysis/application/analyzeOutput'
const root = new URL('../../fixtures/real/', import.meta.url)
const manifest = realFixtureManifestSchema.parse(
  JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')),
)
describe('real Windows capture admission', () => {
  it('rejects unreviewed provenance, path traversal, duplicates and obvious secrets', () => {
    const capture = {
      id: 'test-metadata',
      provenance: 'real-redacted',
      file: 'test-input.txt',
      expectedFile: 'test-expected.json',
      sha256: 'a'.repeat(64),
      os: { name: 'Windows test metadata', version: 'test', build: 'test' },
      shellVersion: 'test',
      locale: 'en-US',
      capturedAt: '2026-10-10T10:00:00Z',
      command: 'ping',
      invocation: 'ping 192.0.2.1',
      scenario: 'minimal',
      reviewed: true,
      ownEnvironment: true,
      redactionNotes: 'Unit metadata only; no real capture is supplied.',
    }
    expect(
      realFixtureManifestSchema.safeParse({ schemaVersion: 1, captures: [capture] }).success,
    ).toBe(true)
    expect(
      realFixtureManifestSchema.safeParse({
        schemaVersion: 1,
        captures: [{ ...capture, file: '../private.txt' }],
      }).success,
    ).toBe(false)
    expect(
      realFixtureManifestSchema.safeParse({
        schemaVersion: 1,
        captures: [{ ...capture, reviewed: false }],
      }).success,
    ).toBe(false)
    expect(
      realFixtureManifestSchema.safeParse({
        schemaVersion: 1,
        captures: [{ ...capture, provenance: 'synthetic' }],
      }).success,
    ).toBe(false)
    expect(
      realFixtureManifestSchema.safeParse({ schemaVersion: 1, captures: [capture, capture] })
        .success,
    ).toBe(false)
    expect(() => assertFixturePrivacy('Authorization: Bearer private-value')).toThrow()
    expect(() => assertFixturePrivacy('alice@realcompany.example')).toThrow()
    expect(() => assertFixturePrivacy('DNS server: 192.0.2.53')).not.toThrow()
  })
  it.skipIf(manifest.captures.length === 0)(
    'each command/version/locale includes minimal and problematic captures',
    () => {
      const groups = new Map<string, Set<string>>()
      for (const c of manifest.captures) {
        const key = `${c.command}:${c.os.name}:${c.os.version}:${c.os.build}:${c.shellVersion}:${c.locale}`
        groups.set(key, (groups.get(key) ?? new Set()).add(c.scenario))
      }
      for (const cases of groups.values())
        expect([...cases].sort()).toEqual(['minimal', 'problematic'])
    },
  )
  for (const c of manifest.captures)
    it(`${c.id}: actual redacted ${c.os.name} ${c.os.build} ${c.locale}`, () => {
      const text = readFileSync(new URL(c.file, root), 'utf8')
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(262144)
      assertFixturePrivacy(text)
      expect(createHash('sha256').update(text).digest('hex')).toBe(c.sha256)
      const expected = JSON.parse(readFileSync(new URL(c.expectedFile, root), 'utf8'))
      const actual = analyzeOutput(text, c.command)
      expect({
        status: actual.parse.status,
        kind: actual.parse.kind,
        value: actual.parse.value ?? null,
        warnings: actual.parse.warnings.map((w) => w.code),
        findings: actual.findings.map((f) => f.ruleId),
      }).toEqual(expected)
    })
})
