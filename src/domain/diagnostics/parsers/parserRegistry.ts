import { parseIpconfig } from './ipconfigParser'
import { evaluateIpconfig } from '../../rules/ipconfigRules'
import { parsePing, parseNslookup, parseTracert, parseRoutes } from './outputParsers'
import { evaluateOutput } from '../../rules/outputRules'
import { parseDnsRecords, parsePowerShell } from './extendedParsers'
import type { ParsedOutput } from '../../types/outputs'
import type { ParseResult } from '../../types/diagnostic'

function analyze(parsed: ParseResult<ParsedOutput>) {
  return parsed.value?.kind === 'ipconfig'
    ? evaluateIpconfig({ ...parsed, value: parsed.value })
    : evaluateOutput(parsed)
}

export const parserRegistry = {
  ipconfig: { kind: 'ipconfig', parse: parseIpconfig, analyze },
  ping: { kind: 'ping', parse: parsePing, analyze },
  nslookup: { kind: 'nslookup', parse: parseNslookup, analyze },
  tracert: { kind: 'tracert', parse: parseTracert, analyze },
  route: { kind: 'route', parse: parseRoutes, analyze },
  'dns-records': { kind: 'dns-records', parse: parseDnsRecords, analyze },
  powershell: { kind: 'powershell', parse: parsePowerShell, analyze },
} as const
