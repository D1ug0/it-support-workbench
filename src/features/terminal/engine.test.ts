import { describe, expect, it } from 'vitest'
import { assessLab, createEnvironment, executeCommand, DNS, HOST, PORTAL, OLD } from './engine'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { compareOutputs } from '../sessions/session'
import { commandExamples, labIds } from './catalog'
function sequence(id: (typeof labIds)[number], commands: string[]) {
  let state = createEnvironment(id)
  for (const command of commands) {
    const result = executeCommand(state, command)
    expect(result.ok, command).toBe(true)
    state = result.state
  }
  return state
}
const tcp = `Test-NetConnection ${HOST} -Port 443`
const setDns = `Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses ${DNS}`
describe('virtual network and diagnostics', () => {
  it('completes the DNS configuration lab with verification after repair', () => {
    const state = sequence(labIds[0], [
      'ipconfig /all',
      tcp,
      `nslookup ${HOST} ${DNS}`,
      setDns,
      tcp,
    ])
    expect(assessLab(state, 0).complete).toBe(true)
    expect(assessLab(state, 1).complete).toBe(false)
    expect(assessLab(state, 0, 2).score).toBe(90)
  })
  it('does not fix an incorrect DNS server by flushing cache or by specifying nslookup server', () => {
    const state = sequence(labIds[0], [`nslookup ${HOST} ${DNS}`, 'ipconfig /flushdns', tcp])
    expect(state.dns).toBe('192.0.2.54')
    expect(state.verifiedRevision).toBeNull()
    expect(assessLab(state, 0).complete).toBe(false)
  })
  it('does not complete a lab with a direct IP TCP check instead of client name resolution', () => {
    const state = sequence(labIds[0], [
      'ipconfig',
      tcp,
      `nslookup ${HOST} ${DNS}`,
      setDns,
      `Test-NetConnection ${PORTAL} -Port 443`,
    ])
    expect(state.verifiedRevision).toBeNull()
    expect(assessLab(state, 0).complete).toBe(false)
  })
  it('invalidates successful verification after a subsequent configuration change', () => {
    const state = sequence(labIds[0], [
      'ipconfig',
      tcp,
      `nslookup ${HOST} ${DNS}`,
      setDns,
      tcp,
      'ipconfig /flushdns',
    ])
    expect(assessLab(state, 0).complete).toBe(false)
  })
  it('keeps direct DNS answers independent from client cache', () => {
    const state = createEnvironment(labIds[1])
    const lookup = executeCommand(state, `nslookup ${HOST}`)
    expect(lookup.output).toContain(PORTAL)
    expect(lookup.state.cache).toBe(OLD)
    const client = executeCommand(lookup.state, `Resolve-DnsName ${HOST}`)
    expect(client.output).toContain(OLD)
    const explicit = executeCommand(client.state, `Resolve-DnsName ${HOST} -Server ${DNS} -Type A`)
    expect(explicit.output).toContain(PORTAL)
    expect(explicit.state.cache).toBe(OLD)
    expect(state.events).toEqual([])
  })
  it('completes stale cache lab and compares TCP addresses and reachability', () => {
    const state = createEnvironment(labIds[1])
    const before = executeCommand(state, tcp)
    expect(before.output).toContain('false')
    const cleared = sequence(labIds[1], [
      'ipconfig /displaydns',
      `nslookup ${HOST}`,
      tcp,
      'ipconfig /flushdns',
    ])
    const after = executeCommand(cleared, tcp)
    expect(assessLab(after.state, 1).complete).toBe(true)
    const a = analyzeOutput(before.output, 'powershell'),
      b = analyzeOutput(after.output, 'powershell')
    const differences = compareOutputs(a.parse.value!, b.parse.value!)
    expect(differences.some((d) => d.field.includes('TCP'))).toBe(true)
    expect(JSON.stringify(differences)).toContain(PORTAL)
  })
  it('separates blocked ICMP and available TCP without requiring mutation', () => {
    const state = sequence(labIds[2], [`ping ${HOST}`, tcp])
    expect(assessLab(state, 2).complete).toBe(true)
    const changed = executeCommand(state, 'ipconfig /flushdns')
    expect(assessLab(changed.state, 2).complete).toBe(false)
    expect(executeCommand(state, `ping ${DNS} -n 1`).output).toContain('Reply from')
    expect(executeCommand(state, `Test-NetConnection ${HOST} -Port 80`).output).toContain('false')
  })
  it.each(commandExamples)(
    'renders supported command %s without using OS or network',
    (command) => {
      const result = executeCommand(createEnvironment(labIds[2]), command)
      expect(result.ok).toBe(true)
      if (result.kind) {
        const parsed = analyzeOutput(result.output, result.kind)
        expect(parsed.parse.status, command).toBe('ok')
        expect(parsed.parse.value?.kind).toBe(result.kind)
      }
    },
  )
  it('supports case, repeated whitespace and quoted argument forms', () => {
    const result = executeCommand(
      createEnvironment(labIds[2]),
      '  TEST-NetConnection   "PORTAL.LAB.EXAMPLE."  -pOrT  443  ',
    )
    expect(result.ok).toBe(true)
    expect(result.output).toContain('true')
  })
  it('provides meaningful results for DNS failure, unknown names and missing routes', () => {
    expect(executeCommand(createEnvironment(labIds[0]), `nslookup ${HOST}`).output).toContain(
      'Non-existent domain',
    )
    expect(executeCommand(createEnvironment(labIds[0]), tcp).kind).toBeUndefined()
    expect(executeCommand(createEnvironment(labIds[0]), `ping ${HOST}`).output).toContain(
      'could not find host',
    )
    expect(executeCommand(createEnvironment(labIds[0]), `tracert ${HOST}`).kind).toBeUndefined()
    expect(executeCommand(createEnvironment(labIds[2]), 'ping 203.0.113.123').output).toContain(
      'Request timed out',
    )
    expect(executeCommand(createEnvironment(labIds[2]), `tracert ${HOST}`).output).toContain(
      'Request timed out',
    )
    expect(
      executeCommand(createEnvironment(labIds[2]), 'Resolve-DnsName absent.lab.example').kind,
    ).toBeUndefined()
  })
  it.each([
    '',
    'x'.repeat(513),
    'ping "broken',
    'ping a\nping b',
    'help; ipconfig',
    'help\u009b31m',
    'help | cmd',
    '`x`',
    '$x',
    'rm -rf /',
    'nslookup a 10.0.0.1',
    'ipconfig /renew',
    'Set-DnsClientServerAddress -InterfaceIndex 1 -ServerAddresses 192.0.2.53',
    'ping portal.lab.example -n 100',
    'ping portal.lab.example -n 1 -n 2',
    'Test-NetConnection portal.lab.example -Port 0',
    'Test-NetConnection portal.lab.example -Port 65536',
    'Resolve-DnsName portal.lab.example -Type AAAA',
  ])('rejects unsupported input without modifying environment: %s', (command) => {
    const state = createEnvironment(labIds[0]),
      copy = structuredClone(state)
    expect(executeCommand(state, command).ok).toBe(false)
    expect(state).toEqual(copy)
  })
  it('clears the terminal view without changing the network or the evidence', () => {
    const state = sequence(labIds[2], [tcp])
    const clear = executeCommand(state, 'cls')
    expect(clear.clear).toBe(true)
    expect(clear.state).toEqual(state)
    expect(executeCommand(state, 'help').output).toContain('PowerShell')
  })
})
