/** Stable process checks; these are not diagnoses of a learner's misconception. */
export type TerminalCheckId =
  | 'configuration'
  | 'authority'
  | 'cache'
  | 'subsystem'
  | 'baseline'
  | 'icmp'
  | 'verification'
  | 'preserve'
  | 'diagnosis'

export interface TerminalCheck {
  id: TerminalCheckId
  label: string
  met: boolean
}

export interface TerminalAssessment {
  checks: TerminalCheck[]
  complete: boolean
  score: number
}
