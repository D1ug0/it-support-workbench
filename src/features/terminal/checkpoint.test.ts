import { expect, it } from 'vitest'
import { checkpointSchema, parseCheckpoint } from './checkpoint'
import { createEnvironment } from './engine'
import { labIds } from './catalog'
const value = () => ({
  schemaVersion: 1,
  environment: createEnvironment(labIds[0]),
  mode: 'guided',
  hints: 0,
  diagnosis: null,
  finished: false,
})
it('round trips strictly bounded environment without command history', () => {
  const parsed = parseCheckpoint(JSON.stringify(value()))
  expect(parsed.environment.labId).toBe(labIds[0])
  expect(parsed.schemaVersion).toBe(1)
})
it.each([
  { ...value(), source: 'PRIVATE-OUTPUT' },
  { ...value(), schemaVersion: 99 },
  { ...value(), environment: { ...value().environment, dns: '10.0.0.1' } },
  { ...value(), environment: { ...value().environment, cache: 'PRIVATE-HOST' } },
  { ...value(), environment: { ...value().environment, revision: 1, verifiedRevision: 2 } },
  { ...value(), environment: { ...value().environment, events: ['settings', 'settings'] } },
  { ...value(), environment: { ...value().environment, verifiedRevision: 0 } },
  { ...value(), mode: 'remote-shell' },
  { ...value(), hints: 4 },
])('rejects unknown fields, private addresses and invalid states', (candidate) => {
  expect(checkpointSchema.safeParse(candidate).success).toBe(false)
  expect(() => parseCheckpoint(JSON.stringify(candidate))).toThrow('Неподдерживаемая')
})
it('rejects malformed and oversized checkpoint files', () => {
  expect(() => parseCheckpoint('{')).toThrow('Неподдерживаемая')
  expect(() => parseCheckpoint(' '.repeat(8193))).toThrow('8 KiB')
})
