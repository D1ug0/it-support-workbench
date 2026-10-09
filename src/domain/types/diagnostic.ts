export type CommandKind = 'ipconfig' | 'ping' | 'nslookup' | 'tracert' | 'route'
export type ParseStatus = 'ok' | 'partial' | 'unsupported' | 'invalid'
export type Severity = 'info' | 'warning' | 'critical'
export type Confidence = 'high' | 'medium' | 'low'
export interface EvidenceRange {
  startLine: number
  endLine: number
}
export interface DiagnosticEvidence {
  field?: string
  adapterId?: string
  range: EvidenceRange
}
export interface DiagnosticFinding {
  id: string
  ruleId: string
  severity: Severity
  confidence: Confidence
  title: string
  explanation: string
  whatItDoesNotProve: string
  nextChecks: Array<{ label: string; why: string; safeReadOnlyCommand?: string }>
  evidence: DiagnosticEvidence[]
}
export interface ParseWarning {
  code: string
  message: string
  range?: EvidenceRange
}
export interface ParseResult<T> {
  status: ParseStatus
  kind: CommandKind | 'unknown'
  value?: T
  warnings: ParseWarning[]
}
export interface AnalysisResult<T> {
  schemaVersion: 1
  parserVersion: string
  createdAt: string
  parse: ParseResult<T>
  findings: DiagnosticFinding[]
}
