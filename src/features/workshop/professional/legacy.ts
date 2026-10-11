import type { ProfessionalAttempt } from './model'
type Step = ProfessionalAttempt['steps'][number]

/** Decode only known legacy messages at the compatibility boundary, never for new grading. */
function legacyOutcome(step: Step): NonNullable<Step['outcome']> {
  if (step.result.startsWith('Минимальное учебное изменение выполнено')) return 'changed'
  if (step.result.startsWith('Пакет эскалации:')) return 'escalated'
  if (step.result.startsWith('Учебный пользовательский запрос успешен')) return 'verified'
  if (step.result.startsWith('Эскалация обоснована')) return 'escalation-verified'
  if (step.result.startsWith('Предыдущее изменение отменено')) return 'rolled-back'
  if (
    step.result.startsWith('Изменение не обосновано') ||
    step.result.startsWith('Нет прав изменять каталог')
  )
    return 'rejected'
  return 'observed'
}

export function stepOutcome(step: Step, version: number) {
  return version >= 3 ? step.outcome : legacyOutcome(step)
}

export function upgradeLegacySteps(steps: Step[]): Step[] {
  return steps.map((step) =>
    step.outcome && step.violations
      ? step
      : {
          ...step,
          outcome: legacyOutcome(step),
          violations: step.result.startsWith('Изменение не обосновано')
            ? ['unjustified-change']
            : [],
        },
  )
}
