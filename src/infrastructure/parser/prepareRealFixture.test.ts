import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
)
function prepare(
  metadataChanges = {},
  text = 'DNS server: 192.0.2.53',
  expected: unknown = {
    status: 'unsupported',
    kind: 'ping',
    value: null,
    warnings: [],
    findings: [],
  },
) {
  const folder = mkdtempSync(join(tmpdir(), 'fixture-metadata-unit-'))
  directories.push(folder)
  const metadata = {
    id: 'unit-metadata',
    provenance: 'real-redacted',
    os: { name: 'Windows test metadata', version: 'test', build: 'test' },
    shellVersion: 'test',
    locale: 'en-US',
    capturedAt: '2026-10-11T10:00:00Z',
    command: 'ping',
    invocation: 'ping 192.0.2.53',
    scenario: 'minimal',
    reviewed: true,
    ownEnvironment: true,
    redactionNotes: 'Unit metadata only; no real Windows capture is supplied.',
    ...metadataChanges,
  }
  const paths = ['metadata.json', 'unit-redacted.txt', 'unit-expected.json'].map((name) =>
    join(folder, name),
  )
  writeFileSync(paths[0]!, JSON.stringify(metadata))
  writeFileSync(paths[1]!, text)
  writeFileSync(paths[2]!, JSON.stringify(expected))
  const result = spawnSync(process.execPath, ['scripts/prepare-real-fixture-entry.mjs', ...paths], {
    encoding: 'utf8',
  })
  return { result, paths, text }
}
describe('fixture metadata preparation (unit inputs only)', () => {
  it('computes a checksum and portable file names without altering the input or producing an oracle', () => {
    const { result, paths, text } = prepare()
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      sha256: createHash('sha256').update(text).digest('hex'),
      file: 'unit-redacted.txt',
      expectedFile: 'unit-expected.json',
    })
    expect(readFileSync(paths[1]!, 'utf8')).toBe(text)
    expect(JSON.parse(readFileSync(paths[2]!, 'utf8')).status).toBe('unsupported')
  })
  it.each([
    { reviewed: false },
    { ownEnvironment: false },
    { provenance: 'real-raw-pending-review' },
  ])('rejects missing admission requirements %s', (flags) => {
    const { result } = prepare(flags)
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
  })
  it('rejects sensitive text and incomplete expected results without echoing the source', () => {
    const secret = 'private-value-for-unit-check'
    const rejected = prepare({}, `Authorization: Bearer ${secret}`).result
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).not.toContain(secret)
    expect(prepare({}, '192.0.2.53', { status: 'ok' }).result.status).toBe(1)
  })
})
