import type { AnalysisResult, CommandKind, ParseResult } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
import { detectCommand } from '../../../infrastructure/parser/detectCommand'
import { normalizeInput, validateInput } from '../../../infrastructure/parser/normalizeInput'
import { parserRegistry } from '../../../infrastructure/parser/parserRegistry'

export function analyzeOutput(
  text: string,
  mode: 'auto' | CommandKind = 'auto',
  createdAt = new Date().toISOString(),
): AnalysisResult<ParsedOutput> {
  const normalized = normalizeInput(text)
  const error = validateInput(normalized)
  if (error)
    return {
      schemaVersion: 1,
      parserVersion: '1.1.0',
      createdAt,
      parse: {
        status: 'invalid',
        kind: 'unknown',
        warnings: [{ code: 'INPUT_INVALID', message: error }],
      },
      findings: [],
    }
  const kind = mode === 'auto' ? detectCommand(normalized).kind : mode
  if (kind === 'unknown')
    return {
      schemaVersion: 1,
      parserVersion: '1.1.0',
      createdAt,
      parse: {
        status: 'unsupported',
        kind: 'unknown',
        warnings: [
          {
            code: 'UNSUPPORTED',
            message:
              'Формат не распознан или содержит несколько команд. Добавьте один вывод ipconfig, ping, nslookup, tracert или route print (RU/EN), либо выберите формат вручную.',
          },
        ],
      },
      findings: [],
    }
  const parser = parserRegistry[kind]
  const parse: ParseResult<ParsedOutput> = parser.parse(normalized)
  return {
    schemaVersion: 1,
    parserVersion: '1.1.0',
    createdAt,
    parse,
    findings: parser.analyze(parse),
  }
}
