import { describe, expect, it } from 'vitest'
import { extendedLabs, variant } from './labDefinitions'
import {
  createNetwork,
  routeTo,
  assessNetwork,
  parseLabPackage,
  topologySchema,
  networkStateSchema,
  undoNetworkChange,
} from './networkModel'
import { executeNetwork } from './networkEngine'
import { executeCommand, createEnvironment } from './engine'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { parseCheckpoint } from './checkpoint'
const fixes: Record<string, string[]> = {
  fleet: [
    'lab hosts',
    'lab verify-fleet',
    'lab repair pc-2 dns',
    'lab repair web-2 service',
    'lab repair api http',
    'Restart-Service WebApp',
    'lab verify-fleet',
  ],
  conflict: ['ipconfig /all', 'curl -I https://portal.lab.example', 'ipconfig /renew'],
  mtu: [
    'Get-NetIPInterface',
    'curl -I https://portal.lab.example',
    'ping -f -l 1472 portal.lab.example',
    'ping -f -l 1372 portal.lab.example',
    'Set-NetIPInterface -InterfaceIndex 12 -NlMtuBytes 1400',
  ],
  dhcp: ['ipconfig /all', 'curl -I https://portal.lab.example', 'ipconfig /renew'],
  mask: [
    'route print',
    'curl -I https://portal.lab.example',
    'Set-NetIPAddress -InterfaceIndex 12 -PrefixLength 24',
  ],
  gateway: ['route print', 'curl -I https://portal.lab.example', 'lab set-gateway 192.0.2.1'],
  route: ['route print', 'curl -I https://portal.lab.example', 'route delete 198.51.100.0'],
  metric: [
    'route print',
    'curl -I https://portal.lab.example',
    'Set-NetRoute -DestinationPrefix 198.51.100.0/24 -RouteMetric 50',
  ],
  vpn: ['route print', 'curl -I https://portal.lab.example', 'rasdial VPN /disconnect'],
  'negative-cache': [
    'ipconfig /displaydns',
    'curl -I https://portal.lab.example',
    'ipconfig /flushdns',
  ],
  dns: [
    'nslookup portal.lab.example 192.0.2.53',
    'curl -I https://portal.lab.example',
    'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53',
    'ipconfig /flushdns',
  ],
  'tls-clock': ['certutil -verify lab.cer', 'curl -I https://portal.lab.example', 'w32tm /resync'],
  'tls-trust': [
    'certutil -verify lab.cer',
    'curl -I https://portal.lab.example',
    'Import-Certificate -FilePath lab-ca.cer -CertStoreLocation Cert:\\LocalMachine\\Root',
  ],
  http: ['Get-Service', 'curl -I https://portal.lab.example', 'Restart-Service WebApp'],
  service: ['Get-Service', 'curl -I https://portal.lab.example', 'Start-Service WebApp'],
  smb: ['whoami /groups', 'Get-SmbConnection', 'lab grant-share-access', 'Get-SmbConnection'],
  gpo: ['gpresult /r', 'gpupdate /force', 'gpresult /r'],
  'linux-permission': [
    'ls -l /etc/lab/app.conf',
    'systemctl status lab-app',
    'chmod 640 /etc/lab/app.conf',
    'systemctl status lab-app',
  ],
  wifi: [
    'netsh wlan show interfaces',
    'curl -I https://portal.lab.example',
    'netsh wlan connect name=LabWiFi',
  ],
  ipv6: [
    'Get-NetAdapterBinding',
    'ping -6 portal.lab.example',
    'Enable-NetAdapterBinding -Name Ethernet -ComponentID ms_tcpip6',
    'ping -6 portal.lab.example',
  ],
  multi: [
    'route print',
    'nslookup portal.lab.example 192.0.2.53',
    'curl -I https://portal.lab.example',
    'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.53',
    'ipconfig /flushdns',
    'route delete 198.51.100.0',
  ],
}
function run(id: string, commands: string[], seed = 0) {
  let state = createEnvironment(id, undefined, seed)
  for (const command of commands) {
    const next = executeCommand(state, command)
    expect(next.ok, command).toBe(true)
    state = next.state
  }
  return state
}
describe('declarative laboratory workflow', () => {
  it.each(extendedLabs)('$id can be solved with evidence and final verification', (definition) => {
    const original = createNetwork(definition)
    expect(topologySchema.safeParse(definition).success).toBe(true)
    const commands = [
      ...fixes[definition.id === 'TERM-FLEET' ? 'fleet' : definition.fault]!,
      'curl -I https://portal.lab.example',
    ]
    const state = run(definition.id, commands)
    expect(assessNetwork(state.network!, 0, 0).complete, definition.id).toBe(true)
    expect(assessNetwork(state.network!, 1, 0).complete).toBe(false)
    expect(networkStateSchema.safeParse(state.network).success).toBe(true)
    expect(original.revision).toBe(0)
  })
  it.each([1, 11, 43, 999999])('reproducible variant %i preserves solvability', (seed) => {
    const definition = extendedLabs[0]!,
      other = variant(definition, seed)
    expect(other).toEqual(variant(definition, seed))
    expect(other.client).not.toBe(definition.client)
    expect(
      assessNetwork(
        run(definition.id, [...fixes.dhcp!, 'curl -I https://portal.lab.example'], seed).network!,
        0,
        0,
      ).complete,
    ).toBe(true)
  })
  it('uses on-link delivery and routes remote traffic through the actual next hop', () => {
    const s = createNetwork(extendedLabs[0]!)
    s.lease = true
    s.client = s.definition.client
    expect(routeTo(s, s.definition.dns).hops).toEqual([s.definition.dns])
    expect(routeTo(s, s.definition.server).hops).toEqual([s.gateway, s.definition.server])
    expect(routeTo(s, '203.0.113.88').reachable).toBe(false)
  })
  it('does not treat ping, another target or a TCP probe as TLS verification', () => {
    const state = run('TERM-TLS-CLOCK', [
      'certutil -verify lab.cer',
      'curl -I https://portal.lab.example',
      'w32tm /resync',
      'Test-NetConnection portal.lab.example -Port 443',
      'ping portal.lab.example',
    ])
    expect(state.network?.verifiedRevision).toBeNull()
    expect(assessNetwork(state.network!, 0, 0).complete).toBe(false)
  })
  it('invalidates verification after a later configuration change', () => {
    const state = run('TERM-DHCP', [
      ...fixes.dhcp!,
      'curl -I https://portal.lab.example',
      'ipconfig /flushdns',
    ])
    expect(state.network?.verifiedRevision).toBeNull()
  })
  it('TTL expiration and direct DNS are independent from negative client cache', () => {
    let state = createEnvironment('TERM-NEGATIVE')
    expect(executeCommand(state, 'nslookup portal.lab.example').output).toContain('198.51.100.20')
    expect(executeCommand(state, 'curl -I https://portal.lab.example').output).toContain('Failed')
    state = executeCommand(state, 'wait 120').state
    expect(state.network?.cache).toBeNull()
    expect(executeCommand(state, 'curl -I https://portal.lab.example').output).toContain('200 OK')
  })
  it('original laboratories now trace local hosts directly and expire positive cache', () => {
    const start = createEnvironment('TERM-DNS-CACHE')
    expect(
      executeCommand(createEnvironment('TERM-ICMP-TCP'), 'tracert 192.0.2.53').output,
    ).not.toContain('192.0.2.1')
    const after = executeCommand(start, 'wait 300').state
    expect(after.cache).toBeNull()
    expect(executeCommand(after, 'Resolve-DnsName portal.lab.example').output).toContain(
      '192.0.2.20',
    )
  })
  it.each([
    'ipconfig /all',
    'route print',
    'tracert portal.lab.example',
    'Test-NetConnection portal.lab.example -Port 443',
    'Get-NetIPConfiguration',
    'Resolve-DnsName portal.lab.example',
    'Resolve-DnsName portal.lab.example -Type AAAA',
    'Resolve-DnsName portal.lab.example -Type CNAME',
    'Resolve-DnsName portal.lab.example -Type MX',
    'Resolve-DnsName portal.lab.example -Type TXT',
    'Resolve-DnsName portal.lab.example -Type SRV',
  ])('generated %s round trips through the real parser', (command) => {
    let state = createEnvironment('TERM-HTTP')
    state = executeCommand(state, 'Restart-Service WebApp').state
    const result = executeCommand(state, command)
    expect(result.ok).toBe(true)
    expect(result.kind).toBeDefined()
    const parsed = analyzeOutput(result.output, result.kind)
    expect(parsed.parse.status).toBe('ok')
  })
  it.each([
    'wait -1',
    'wait 3601',
    'route delete 10.0.0.1',
    'Set-NetIPAddress -InterfaceIndex 12 -PrefixLength 999',
    'curl https://outside.example',
    'Get-Service ; rm',
    'Set-NetRoute -DestinationPrefix 198.51.100.0/24 -RouteMetric 0',
  ])('rejects unsupported mutation %s without changing state', (command) => {
    const original = createNetwork(extendedLabs[0]!)
    const result = executeNetwork(original, command.split(' '))
    if (command === 'route delete 10.0.0.1') {
      expect(result.state).toEqual(original)
    } else expect(result.ok).toBe(false)
    expect(original.revision).toBe(0)
  })
  it('imports strict custom packages and restores network checkpoints without command history', () => {
    const definition = { ...extendedLabs[0]!, id: 'USR-00000000-0000-4000-8000-000000000002' }
    expect(parseLabPackage(JSON.stringify({ schemaVersion: 1, labs: [definition] }))).toEqual([
      definition,
    ])
    const environment = createEnvironment(definition.id, definition)
    const value = {
      schemaVersion: 2,
      environment,
      mode: 'practice',
      hints: 0,
      diagnosis: null,
      finished: false,
    }
    expect(parseCheckpoint(JSON.stringify(value)).environment.labId).toBe(definition.id)
    expect(() =>
      parseLabPackage(JSON.stringify({ schemaVersion: 1, labs: [extendedLabs[0]] })),
    ).toThrow()
    expect(() =>
      parseLabPackage(
        JSON.stringify({ schemaVersion: 1, labs: [{ ...definition, client: '10.0.0.1' }] }),
      ),
    ).toThrow()
    expect(() =>
      parseLabPackage(JSON.stringify({ schemaVersion: 1, labs: [definition, definition] })),
    ).toThrow()
  })
})

it('keeps different DNS names isolated and validates restored evidence', () => {
  const s = createNetwork(extendedLabs.find((l) => l.id === 'TERM-HTTP')!)
  const first = executeCommand(
    createEnvironment(s.definition.id),
    'Resolve-DnsName dns.lab.example',
  ).state
  expect(executeCommand(first, 'Resolve-DnsName portal.lab.example').output).toContain(
    s.definition.server,
  )
  expect(networkStateSchema.safeParse({ ...s, evidence: ['config', 'config'] }).success).toBe(false)
  expect(networkStateSchema.safeParse({ ...s, verifiedRevision: 1 }).success).toBe(false)
  expect(
    networkStateSchema.safeParse({
      ...s,
      timeline: [{ time: 1, type: 'inspect', message: 'future' }],
    }).success,
  ).toBe(false)
  expect(
    topologySchema.safeParse({ ...s.definition, fault: 'route', server: '192.0.2.20' }).success,
  ).toBe(false)
})
it('accepts custom documentation DNS/server addresses and arbitrary JSON whitespace in v2', () => {
  const d = {
    ...extendedLabs[0]!,
    id: 'USR-00000000-0000-4000-8000-000000000003',
    dns: '192.0.2.70',
    server: '203.0.113.40',
  }
  const environment = createEnvironment(d.id, d)
  const value = {
    schemaVersion: 2,
    variantSeed: 43,
    environment,
    mode: 'practice',
    hints: 0,
    diagnosis: null,
    finished: false,
  }
  expect(
    parseCheckpoint(JSON.stringify(value, null, '    ') + ' '.repeat(9000)).schemaVersion,
  ).toBe(2)
  expect(() =>
    parseCheckpoint(
      JSON.stringify({ ...value, environment: { ...environment, dns: '192.0.2.53' } }),
    ),
  ).toThrow()
})

describe('change review and recovery', () => {
  it('detects an added failure, preserves its review through undo and requires fresh verification', () => {
    const initial = createNetwork(extendedLabs.find((l) => l.id === 'TERM-HTTP')!)
    const run = (s: typeof initial, text: string) => executeNetwork(s, text.split(' ')).state
    const inspected = run(run(initial, 'Get-Service WebApp'), 'curl -I https://portal.lab.example')
    const regressed = run(
      inspected,
      'Set-DnsClientServerAddress -InterfaceIndex 12 -ServerAddresses 192.0.2.54',
    )
    expect(regressed.changeAudit.regressions).toBe(1)
    const reverted = undoNetworkChange(regressed, inspected)
    expect(reverted.dns).toBe(initial.definition.dns)
    expect(reverted.changeAudit).toMatchObject({ regressions: 1, rollbacks: 1 })
    expect(reverted.verifiedRevision).toBeNull()
    const repaired = run(reverted, 'Restart-Service WebApp')
    expect(assessNetwork(repaired, 0, 0).complete).toBe(false)
    const verified = run(repaired, 'curl -I https://portal.lab.example')
    expect(assessNetwork(verified, 0, 0)).toMatchObject({ complete: true, score: 95 })
    expect(networkStateSchema.safeParse(verified).success).toBe(true)
  })
  it('reviews an ineffective change, caps its penalty and expires cache on virtual-time undo', () => {
    const initial = createNetwork(extendedLabs.find((l) => l.id === 'TERM-HTTP')!)
    const observed = executeNetwork(initial, ['curl', '-I', 'https://portal.lab.example']).state
    const change = executeNetwork(observed, [
      'Set-NetIPAddress',
      '-InterfaceIndex',
      '12',
      '-PrefixLength',
      '24',
    ]).state
    expect(change.changeAudit.unnecessary).toBe(1)
    const waited = executeNetwork(change, ['wait', '300']).state
    const undone = undoNetworkChange(waited, observed)
    expect(undone.clock).toBe(300)
    expect(undone.cache).toBeNull()
    const maximum = {
      ...undone,
      revision: 1000,
      changeAudit: { repairs: 0, regressions: 999, unnecessary: 0, rollbacks: 1 },
    }
    expect(() => undoNetworkChange(maximum, observed)).toThrow('Откат недоступен')
    expect(assessNetwork(maximum, 0, 0).score).toBe(30)
  })
  it('supports older checkpoint states without audit but rejects forged audit counts and cross-lab undo', () => {
    const s = createNetwork(extendedLabs[0]!)
    const { changeAudit, ...old } = s
    expect(networkStateSchema.parse(old).changeAudit).toEqual(changeAudit)
    expect(
      networkStateSchema.safeParse({ ...s, changeAudit: { ...changeAudit, repairs: 1 } }).success,
    ).toBe(false)
    const another = createNetwork(extendedLabs[1]!)
    expect(() => undoNetworkChange(s, another)).toThrow()
  })
})
