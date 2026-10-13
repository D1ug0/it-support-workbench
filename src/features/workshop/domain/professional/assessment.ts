import { professionalCases, faultIds } from './definitions'
import type { ProfessionalAttempt } from './model'
import { stepOutcome, upgradeLegacySteps } from './legacy'
export function hypothesisEvidence(
  a: ProfessionalAttempt,
  row: ProfessionalAttempt['hypotheses'][number],
) {
  const step = row.step === null ? undefined : a.steps[row.step - 1]
  const finding = step?.findings.find((f) => f.fault === row.fault)
  const conclusion =
    finding?.present === true
      ? 'confirmed'
      : finding?.present === false
        ? 'refuted'
        : 'inconclusive'
  return {
    step,
    conclusion,
    matches: row.conclusion === conclusion,
    stale: !!step && step.revision !== a.revision,
  }
}
export function supportsFault(
  a: ProfessionalAttempt,
  fault: (typeof faultIds)[number],
  refs: number[],
) {
  return a.hypotheses.some(
    (row) =>
      row.fault === fault &&
      row.step !== null &&
      refs.includes(row.step) &&
      row.conclusion === 'confirmed' &&
      hasExplanation(row.explanation) &&
      hypothesisEvidence(a, row).matches,
  )
}
export function canCompleteProfessional(a: ProfessionalAttempt): boolean {
  if (a.caseId === 'unknown' && (a.seed === null || a.variant !== a.seed % 4)) return false
  const expectedFaults = professionalCases.find((c) => c.id === a.caseId)?.faults[a.variant]
  if (!expectedFaults) return false
  const recordedFaults = [...a.remaining, ...a.repaired]
  if (
    recordedFaults.length !== expectedFaults.length ||
    recordedFaults.some((f) => !(expectedFaults as readonly string[]).includes(f))
  )
    return false
  const remaining = a.remaining.filter((f) => !(f === 'permissions' && a.escalated))
  const recovery =
    a.caseId !== 'recovery' ||
    (a.recoveryMinutes !== null &&
      a.recoveryMinutes <= 20 &&
      a.lossMinutes !== null &&
      a.lossMinutes ===
        (a.restoredSnapshot === '10:02' ? 3 : a.restoredSnapshot === '09:30' ? 35 : null) &&
      a.lossMinutes <= 5 &&
      a.recoveryMinutes === a.elapsedMinutes &&
      a.elapsedMinutes === a.steps.reduce((time, s) => time + actionMinutes(s.action), 0) &&
      a.steps.some(
        (s, i) =>
          s.action === 'content' && s.revision === a.revision && a.evidenceRefs.includes(i + 1),
      ))
  const cited = a.evidenceRefs.map((id) => a.steps[id - 1]).filter((s) => !!s)
  const diagnosed = [...a.repaired, ...remaining, ...(a.escalated ? ['permissions'] : [])]
  const structure =
    new Set(a.evidenceRefs).size === a.evidenceRefs.length &&
    a.evidenceRefs.every((id) => !!a.steps[id - 1]) &&
    ['clarify', 'scope', 'verify'].every((action) =>
      cited.some((s) => s.action === action && (action !== 'verify' || s.revision === a.revision)),
    ) &&
    a.repaired.every((f) =>
      cited.some(
        (s) => s.action === `repair:${f}` && stepOutcome(s, a.gradingVersion) === 'changed',
      ),
    ) &&
    (!a.escalated ||
      cited.some(
        (s) => s.action === 'escalate' && stepOutcome(s, a.gradingVersion) === 'escalated',
      )) &&
    cited.some(
      (s) =>
        s.action === 'verify' &&
        s.revision === a.revision &&
        (stepOutcome(s, a.gradingVersion) === 'verified' ||
          (a.escalated && stepOutcome(s, a.gradingVersion) === 'escalation-verified')),
    ) &&
    diagnosed.every((f) => a.hypothesisFaults.includes(f as (typeof faultIds)[number])) &&
    a.hypothesisFaults.every((f) => diagnosed.includes(f))
  return (
    remaining.length === 0 &&
    a.verifiedRevision === a.revision &&
    ['clarify', 'scope'].every((o) => a.observations.includes(o)) &&
    Object.values(a.report).every(hasExplanation) &&
    new Set(Object.values(a.report).map((s) => s.trim().toLowerCase())).size >= 4 &&
    structure &&
    recovery &&
    (a.caseId !== 'unknown' ||
      (a.repaired.every((f) => supportsFault(a, f, a.evidenceRefs)) &&
        a.hypotheses.every((row) => hypothesisEvidence(a, row).matches)))
  )
}
// A small anti-placeholder check, not a semantic/text quality assessment.
export function actionMinutes(action: string) {
  return action === 'repair:backup'
    ? 4
    : action.startsWith('repair:') || action === 'rollback'
      ? 2
      : 1
}
export function hasExplanation(value: string) {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return (
    value.trim().length >= 20 && new Set(words).size >= 3 && new Set(value.toLowerCase()).size >= 8
  )
}
export function finishProfessional(original: ProfessionalAttempt): ProfessionalAttempt {
  if (original.status === 'completed') return original
  const a = { ...original, steps: upgradeLegacySteps(original.steps), gradingVersion: 3 as const }
  if (!canCompleteProfessional(a))
    throw new Error(
      'Не выполнены цели: нужны подтверждённые причины, ссылки на уточнение, масштаб, обоснованное изменение/эскалацию и свежую пользовательскую проверку. Заполните пять разных пояснений. После восстановления нужна проверка содержимого; учебный RTO ≤ 20 мин и RPO ≤ 5 мин.',
    )
  const penalties =
    a.steps.filter((step) => step.violations?.includes('unjustified-change')).length * 10
  return { ...a, status: 'completed', score: Math.max(0, 100 - Math.min(50, penalties)) }
}
