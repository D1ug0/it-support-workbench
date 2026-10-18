import { describe, expect, it } from 'vitest'
import { parseDnsRecords } from './extendedParsers'

const srv = (fields: { priority?: string; weight?: string; port?: string } = {}) =>
  '_ldap._tcp.lab.example SRV service location:\n' +
  ` priority = ${fields.priority ?? '0'}\n` +
  ` weight = ${fields.weight ?? '100'}\n` +
  ` port = ${fields.port ?? '389'}\n` +
  ' svr hostname = dc.lab.example'

describe('textual SRV fields', () => {
  it.each(['0x10', '0b10', '1e2', '+1', '-0', '1.0', '65536', '9'.repeat(400)])(
    'excludes non-decimal or out-of-range fields %s while retaining the next record',
    (invalid) => {
      for (const field of ['priority', 'weight', 'port'] as const) {
        const result = parseDnsRecords(srv({ [field]: invalid }) + '\n\n' + srv())
        expect(result.status).toBe('partial')
        expect(result.value?.records).toHaveLength(1)
        expect(result.value?.records[0]).toMatchObject({ line: 7, port: 389 })
        expect(result.warnings[0]).toMatchObject({
          code: 'DNS_SRV_INCOMPLETE',
          range: { startLine: 1, endLine: 1 },
        })
      }
    },
  )

  it('accepts decimal zero, leading zeros and the unsigned 16-bit boundary', () => {
    const result = parseDnsRecords(srv({ priority: '000', weight: '65535', port: '0' }))
    expect(result.status).toBe('ok')
    expect(result.value?.records[0]).toMatchObject({ priority: 0, weight: 65535, port: 0 })
  })

  it('does not reuse a previous valid target when a repeated target is malformed', () => {
    const result = parseDnsRecords(srv() + '\n svr hostname = bad/target\n\n' + srv())
    expect(result.status).toBe('partial')
    expect(result.value?.records.map((record) => record.line)).toEqual([8])
  })
})
