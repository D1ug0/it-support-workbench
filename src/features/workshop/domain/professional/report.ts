import type { ProfessionalAttempt } from './model'
import type { ExplanationReport } from '../explanationReview'

export function professionalExplanationReport(attempt: ProfessionalAttempt): ExplanationReport {
  return {
    ...attempt.report,
    limits: attempt.reportLimits ?? '',
    evidenceRefs: attempt.evidenceRefs.slice(0, 40).flatMap((id) => {
      const step = attempt.steps[id - 1]
      return step
        ? [
            {
              commandId: id,
              revision: step.revision,
              command: step.action,
              summary: step.result.slice(0, 300),
            },
          ]
        : []
    }),
  }
}
