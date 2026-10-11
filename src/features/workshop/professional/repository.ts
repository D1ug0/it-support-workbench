import { workshopDb, learningTables, assertStorageBudget } from '../storage'
import { putVersioned } from '../versionedRecord'
import { appendReportRevision } from '../reportHistory'
import { explanationContentKey } from '../explanationReview'
import { professionalExplanationReport } from './report'
import { professionalAttemptSchema, type ProfessionalAttempt } from './model'
export const professionalAttempts = workshopDb.table<ProfessionalAttempt, string>(
  'professionalAttempts',
)
export async function saveProfessional(value: ProfessionalAttempt) {
  const valid = professionalAttemptSchema.parse(value)
  valid.updatedAt = new Date().toISOString()
  return workshopDb.transaction('rw', learningTables(), async () => {
    if ((await professionalAttempts.count()) >= 50 && !(await professionalAttempts.get(valid.id)))
      throw new Error('Лимит: 50 профессиональных попыток.')
    const stored = await professionalAttempts.get(valid.id)
    const previous = stored ? professionalAttemptSchema.parse(stored) : undefined
    if (previous) {
      const previousReport = professionalExplanationReport(previous)
      const changed =
        explanationContentKey(previousReport) !==
          explanationContentKey(professionalExplanationReport(valid)) ||
        JSON.stringify(previous.explanationReview) !== JSON.stringify(valid.explanationReview)
      valid.reportHistory = changed
        ? appendReportRevision(previous.reportHistory, {
            version: previous.reportVersion ?? 1,
            at: previous.updatedAt ?? previous.at,
            report: previousReport,
            review: previous.explanationReview ?? null,
          })
        : previous.reportHistory
      valid.reportVersion = (previous.reportVersion ?? 1) + (changed ? 1 : 0)
    } else valid.reportVersion = 1
    const saved = await putVersioned(professionalAttempts, valid)
    await assertStorageBudget()
    return saved
  })
}
