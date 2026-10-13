import { confirmDiscardForms, useUnsavedChanges } from '../../../shared/unsavedChanges'
import { useRoute } from 'vue-router'
import { readDrafts, getDraft, draftSchema, saveDraft } from '../infrastructure/draftRepository'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTerminalStore } from '../../terminal/useTerminalStore'
import { useWorkshopStore } from './useWorkshopStore'
import { reportSchema, reportMarkdown } from '../domain/portfolio'
import type { ExplanationReview } from '../domain/explanationReview'
import type { TerminalRecord } from '../../terminal/useTerminalStore'
export function useInvestigationSession() {
  const route = useRoute()
  const terminal = useTerminalStore(),
    workshop = useWorkshopStore()
  const symptom = ref(''),
    hypothesis = ref(''),
    evidence = ref(''),
    change = ref(''),
    verification = ref(''),
    limits = ref(''),
    consent = ref(false),
    error = ref(''),
    notice = ref(''),
    busy = ref(false)
  const reportId = ref<string>(globalThis.crypto.randomUUID()),
    reportToken = ref<string | null>(null),
    reportTitle = ref(terminal.lab.title),
    reportLabId = ref(terminal.lab.id),
    reportAt = ref(new Date().toISOString()),
    reportVersion = ref(1),
    draftToken = ref<string | null>(null),
    reportAttemptId = ref(terminal.attemptId),
    status = ref<'draft' | 'completed'>('draft')
  const explanationReview = ref<ExplanationReview | null>(null)
  const inheritedRefs = ref<import('../domain/portfolio').PortfolioReport['evidenceRefs']>([]),
    inheritedScore = ref<number | null>(null),
    inheritedFinished = ref(false)
  function sameReference(
    reference: import('../domain/portfolio').PortfolioReport['evidenceRefs'][number],
    record: TerminalRecord,
  ) {
    if (reference.recordId || record.recordId) return reference.recordId === record.recordId
    return (
      reference.commandId === record.id &&
      reference.revision === record.revision &&
      reference.command === record.command
    )
  }
  // Capture references when selected, so the 40-command history limit cannot erase them.
  function toggleReference(record: TerminalRecord, checked: boolean) {
    const exists = inheritedRefs.value.some((reference) => sameReference(reference, record))
    if (!checked) {
      inheritedRefs.value = inheritedRefs.value.filter(
        (reference) => !sameReference(reference, record),
      )
    } else if (!exists && inheritedRefs.value.length < 40) {
      inheritedRefs.value = [
        ...inheritedRefs.value,
        {
          commandId: record.id,
          recordId: record.recordId,
          revision: record.revision,
          command: record.command,
          summary: record.ok
            ? record.changed
              ? 'Изменение синтетической среды; сопоставьте с выводом в терминале.'
              : 'Синтетический результат; сопоставьте с выводом в терминале.'
            : 'Команда отклонена.',
        },
      ]
    }
  }
  const noteSnapshot = () =>
    JSON.stringify([
      symptom.value,
      hypothesis.value,
      evidence.value,
      change.value,
      verification.value,
      limits.value,
      explanationReview.value,
      inheritedRefs.value,
      status.value,
    ])
  const { markSaved } = useUnsavedChanges(noteSnapshot)
  const savedDrafts = ref<import('../domain/drafts').LearningDraft[]>([])
  const ready = ref(false)
  let loadGeneration = 0
  let disposed = false
  onBeforeUnmount(() => {
    loadGeneration++
    disposed = true
  })
  onMounted(async () => {
    await workshop.initialize()
    if (disposed) return
    savedDrafts.value = (await readDrafts().catch(() => [])).flatMap((v) => {
      const p = draftSchema.safeParse(v)
      return p.success && p.data.kind === 'investigation' ? [p.data] : []
    })
    if (disposed) return
    ready.value = true
    if (typeof route.query.report === 'string') editReport(route.query.report)
  })
  watch(
    () => route.query.report,
    (id) => {
      if (ready.value && typeof id === 'string' && id !== reportId.value) editReport(id, true)
    },
    { flush: 'post' },
  )
  watch(
    () => terminal.attemptId,
    () => {
      loadGeneration++
      reportId.value = globalThis.crypto.randomUUID()
      reportAttemptId.value = terminal.attemptId
      reportVersion.value = 1
      reportToken.value = null
      reportTitle.value = terminal.lab.title
      reportLabId.value = terminal.lab.id
      reportAt.value = new Date().toISOString()
      draftToken.value = null
      status.value = 'draft'
      inheritedRefs.value = []
      inheritedScore.value = null
      inheritedFinished.value = false
      symptom.value = ''
      hypothesis.value = ''
      evidence.value = ''
      change.value = ''
      verification.value = ''
      limits.value = ''
      explanationReview.value = null
      consent.value = false
      markSaved()
    },
  )
  const report = computed(() => ({
    id: reportId.value,
    storageToken: reportToken.value,
    version: reportVersion.value,
    status: status.value,
    attemptId: reportAttemptId.value,
    attemptFinished:
      reportAttemptId.value === terminal.attemptId
        ? terminal.finished
        : inheritedFinished.value ||
          workshop.state.events.some(
            (event) =>
              event.module === 'terminal' &&
              event.attemptId === reportAttemptId.value &&
              ['completed', 'failed'].includes(event.outcome),
          ),
    evidenceRefs: inheritedRefs.value,
    title: reportTitle.value,
    at: reportAt.value,
    labId: reportLabId.value,
    symptom: symptom.value,
    hypothesis: hypothesis.value,
    evidence: evidence.value,
    change: change.value,
    verification: verification.value,
    limits: limits.value,
    explanationReview: explanationReview.value,
    score:
      reportAttemptId.value === terminal.attemptId
        ? (terminal.feedback?.score ?? inheritedScore.value)
        : inheritedScore.value,
  }))
  const reviewAvailable = computed(() => report.value.attemptFinished)
  const previewText = computed(() => {
    const parsed = reportSchema.safeParse(report.value)
    return reportMarkdown(parsed.success ? parsed.data : { ...report.value, status: 'draft' })
  })
  async function save() {
    if (busy.value) return
    if (!consent.value) {
      error.value = 'Подтвердите проверку заметок перед сохранением.'
      return
    }
    busy.value = true
    error.value = ''
    notice.value = ''
    const before = noteSnapshot(),
      id = reportId.value
    try {
      const stored = await workshop.saveReport(reportSchema.parse(report.value))
      if (id === reportId.value) {
        reportToken.value = stored.storageToken
        reportVersion.value++
        markSaved(before)
      }
      notice.value = 'Учебный отчёт сохранён в портфолио.'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Не удалось сохранить отчёт.'
    } finally {
      busy.value = false
    }
  }
  async function saveNotes() {
    if (!consent.value || busy.value) return
    busy.value = true
    error.value = ''
    const before = noteSnapshot(),
      id = reportId.value
    try {
      const value = draftSchema.parse({
        id: reportId.value,
        storageToken: draftToken.value,
        kind: 'investigation',
        attemptId: reportAttemptId.value,
        attemptFinished: report.value.attemptFinished,
        taskId: reportLabId.value,
        title: reportTitle.value,
        at: new Date().toISOString(),
        notes: {
          symptom: symptom.value,
          hypothesis: hypothesis.value,
          evidence: evidence.value,
          change: change.value,
          verification: verification.value,
          limits: limits.value,
        },
        explanationReview: explanationReview.value,
        evidenceRefs: report.value.evidenceRefs,
        reportStatus: status.value,
        score: report.value.score,
      })
      const stored = await saveDraft(value)
      if (id === reportId.value) draftToken.value = stored.storageToken
      savedDrafts.value = [...savedDrafts.value.filter((d) => d.id !== stored.id), stored]
      if (id === reportId.value) markSaved(before)
      notice.value = 'Черновик сохранён вручную; доступен после перезагрузки.'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Черновик не сохранён.'
    } finally {
      busy.value = false
    }
  }
  async function resumeDraft(id: string) {
    if (busy.value || !confirmDiscardForms()) return
    const generation = ++loadGeneration,
      before = noteSnapshot()
    const parsed = draftSchema.safeParse(await getDraft(id).catch(() => undefined))
    if (generation !== loadGeneration) return
    if (busy.value || before !== noteSnapshot()) {
      error.value =
        'Форма изменилась во время чтения черновика. Текущие заметки остались в форме; повторите загрузку при необходимости.'
      return
    }
    const d = parsed.success ? parsed.data : undefined
    if (!d) {
      error.value = 'Черновик удалён или недоступен; текущие заметки можно экспортировать.'
      return
    }
    error.value = ''
    inheritedRefs.value = d.evidenceRefs
    inheritedScore.value = d.score
    inheritedFinished.value = d.attemptFinished
    explanationReview.value = d.explanationReview
    status.value = d.reportStatus
    reportVersion.value = (workshop.portfolio.find((r) => r.id === d.id)?.version ?? 0) + 1
    reportToken.value = workshop.portfolio.find((r) => r.id === d.id)?.storageToken ?? null
    reportLabId.value = d.taskId
    reportTitle.value = d.title ?? workshop.portfolio.find((r) => r.id === d.id)?.title ?? d.taskId
    reportAt.value = d.at
    reportId.value = d.id
    draftToken.value = d.storageToken
    reportAttemptId.value = d.attemptId
    for (const [key, target] of Object.entries({
      symptom,
      hypothesis,
      evidence,
      change,
      verification,
      limits,
    }))
      target.value = d.notes[key] ?? ''
    markSaved()
    notice.value = `Продолжен черновик попытки ${d.attemptId}. Среда восстанавливается отдельно через контрольную точку.`
  }
  function editReport(id: string, navigationConfirmed = false) {
    if (busy.value || (!navigationConfirmed && !confirmDiscardForms())) return
    loadGeneration++
    const r = workshop.portfolio.find((r) => r.id === id)
    if (!r) return
    inheritedRefs.value = r.evidenceRefs
    inheritedScore.value = r.score
    inheritedFinished.value = r.attemptFinished
    reportAttemptId.value = r.attemptId ?? terminal.attemptId
    reportId.value = r.id
    reportToken.value = r.storageToken
    reportTitle.value = r.title
    reportLabId.value = r.labId
    reportAt.value = r.at
    draftToken.value = savedDrafts.value.find((d) => d.id === id)?.storageToken ?? null
    reportVersion.value = r.version + 1
    status.value = r.status
    explanationReview.value = r.explanationReview
    for (const [key, target] of Object.entries({
      symptom,
      hypothesis,
      evidence,
      change,
      verification,
      limits,
    }))
      target.value = r[key as 'symptom']
    markSaved()
  }

  return {
    terminal,
    workshop,
    symptom,
    hypothesis,
    evidence,
    change,
    verification,
    limits,
    consent,
    error,
    notice,
    busy,
    reportId,
    reportTitle,
    reportLabId,
    reportAttemptId,
    status,
    explanationReview,
    inheritedRefs,
    sameReference,
    toggleReference,
    savedDrafts,
    report,
    reviewAvailable,
    previewText,
    save,
    saveNotes,
    resumeDraft,
    editReport,
  }
}
