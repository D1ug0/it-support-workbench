import {
  workshopDb as db,
  learningTables,
  assertStorageBudget,
} from '../../../infrastructure/learning-storage/database'
import { reportSchema } from '../domain/portfolio'
import { putVersioned } from './versionedRecord'
import { appendReportRevision } from '../domain/reportHistory'
import { explanationContentKey } from '../domain/explanationReview'
import { saveMaterials, deleteMaterial } from './materialsRepository'
import type {
  WorkshopRepository,
  StoredWorkshop,
  StoredMaterial,
} from '../application/workshopRepository'
import type { PortfolioReport } from '../domain/portfolio'

const settings = db.table<StoredWorkshop, string>('settings')
const reports = db.table<PortfolioReport, string>('reports')

export const workshopRepository: WorkshopRepository = {
  read() {
    return Promise.allSettled([
      settings.get('progress'),
      db.table<StoredMaterial, string>('labs').toArray(),
      db.table<StoredMaterial, string>('graphs').toArray(),
      reports.toArray(),
      db.table<StoredMaterial, string>('courses').toArray(),
    ])
  },
  async saveProgress(snapshot, expectedRevision) {
    const next = expectedRevision + 1
    await db.transaction('rw', learningTables(), async () => {
      const current = await settings.get('progress')
      if ((current?.revision ?? 0) !== expectedRevision)
        throw new Error(
          'Прогресс изменён в другой вкладке. Экспортируйте попытку и перечитайте сохранённую версию.',
        )
      await settings.put({ id: 'progress', value: snapshot, enabled: true, revision: next })
      await assertStorageBudget()
    })
    return next
  },
  async disableProgress() {
    return db.transaction('rw', settings, async () => {
      const current = await settings.get('progress')
      if (!current) return undefined
      const revision = (current.revision ?? 0) + 1
      await settings.update('progress', { enabled: false, revision })
      return revision
    })
  },
  async clearProgress() {
    await settings.delete('progress')
  },
  readMaterials(collection) {
    return db.table<StoredMaterial, string>(collection).toArray()
  },
  saveMaterials,
  deleteMaterial,
  async saveReport(value) {
    const valid = reportSchema.parse(value)
    return db.transaction('rw', learningTables(), async () => {
      if ((await reports.count()) >= 50 && !(await reports.get(valid.id)))
        throw new Error('Лимит: 50 отчётов.')
      const previous = await reports.get(valid.id)
      if (previous && reportSchema.parse(previous).version >= valid.version)
        throw new Error('Отчёт изменён в другой вкладке. Перечитайте его перед редактированием.')
      const previousReport = previous ? reportSchema.parse(previous) : undefined
      const changed =
        previousReport &&
        (explanationContentKey(previousReport) !== explanationContentKey(valid) ||
          JSON.stringify(previousReport.explanationReview) !==
            JSON.stringify(valid.explanationReview))
      const candidate = {
        ...valid,
        reportHistory: changed
          ? appendReportRevision(previousReport.reportHistory, {
              version: previousReport.version,
              at: previousReport.at,
              report: previousReport,
              review: previousReport.explanationReview,
            })
          : (previousReport?.reportHistory ?? valid.reportHistory),
      }
      const saved = await putVersioned(reports, reportSchema.parse(candidate))
      await assertStorageBudget()
      return saved
    })
  },
  async removeReport(id) {
    await reports.delete(id)
  },
}
