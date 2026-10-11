import { normalizeCommandName } from './commandRegistry'

export function tokenizeCommand(command: string): string[] | undefined {
  if (
    !command.trim() ||
    command.length > 512 ||
    /[;|&<>`$]/.test(command) ||
    [...command].some(
      (c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159),
    )
  )
    return
  const tokens: string[] = []
  let current = '',
    quote = ''
  for (const c of command.trim()) {
    if (quote) {
      if (c === quote) quote = ''
      else current += c
    } else if (c === '"' || c === "'") quote = c
    else if (/\s/.test(c)) {
      if (current) tokens.push(current)
      current = ''
    } else current += c
  }
  if (quote) return
  if (current) tokens.push(current)
  return tokens
}
// Normalize syntax according to the command family; argument values retain their original case.
export function parseCommandTokens(tokens: string[]) {
  const cmd = normalizeCommandName(tokens[0] ?? '')
  const sensitive = ['ls', 'chmod', 'systemctl', 'journalctl', 'curl', 'curl.exe'].includes(cmd)
  const args = tokens
    .slice(1)
    .map((value) => (!sensitive && /^[-/]/.test(value) ? value.toLowerCase() : value))
  if (['lab', 'route'].includes(cmd) && args[0]) args[0] = args[0].toLowerCase()
  if (cmd === 'lab' && args[0] === 'repair' && args[2]) args[2] = args[2].toLowerCase()
  const form = [cmd, ...args].join(' ')
  return {
    cmd,
    args,
    matches: (expected: string) =>
      sensitive ? form === expected : form.toLowerCase() === expected.toLowerCase(),
  }
}
