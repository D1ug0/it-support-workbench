import { confirmDiscardForms, useUnsavedChanges } from '../../../shared/unsavedChanges'
import { readDrafts, getDraft, draftSchema, saveDraft } from '../infrastructure/draftRepository'
import { loadCollection } from '../../../shared/persistence/collectionLoader'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { standTasks, standAttemptSchema, standMarkdown, type StandAttempt } from '../domain/stand'
import { useWorkshopStore } from './useWorkshopStore'
import {
  saveStandAttempt,
  readStandAttempts,
  getStandAttempt,
  deleteStandAttempt,
} from '../infrastructure/standRepository'
import { downloadText } from '../../../infrastructure/export/exportReport'
import { analyzeOutput } from '../../network-analysis/application/analyzeOutput'
import { detectCommand } from '../../../domain/diagnostics/parsers/detectCommand'
import { compareOutputs } from '../../sessions/session'
import type { ParsedOutput } from '../../../domain/types/outputs'
import { useRoute } from 'vue-router'
export function useStandSession() {
  const route = useRoute()
  const taskId = ref(standTasks.find((t) => t.id === route.query.task)?.id ?? standTasks[0]!.id),
    task = computed(() => standTasks.find((t) => t.id === taskId.value)!)
  const own = ref(false),
    isolated = ref(false),
    snapshot = ref(false),
    consent = ref(false),
    busy = ref(false),
    error = ref(''),
    notice = ref('')
  const notes = ref({
    platform: '',
    symptom: '',
    hypothesis: '',
    change: '',
    verification: '',
    answer: '',
    completedSteps: [] as number[],
  })
  const draftId = ref<string>(globalThis.crypto.randomUUID()),
    draftToken = ref<string | null>(null),
    reportToken = ref<string | null>(null),
    attemptId = ref<string>(globalThis.crypto.randomUUID()),
    previousTask = ref(taskId.value)
  const { markSaved } = useUnsavedChanges(() => JSON.stringify(notes.value))
  const savedDrafts = ref<import('../domain/drafts').LearningDraft[]>([])
  const saved = ref<StandAttempt[]>([]),
    revealed = ref(false)
  const captures = ref<{ before?: ParsedOutput; after?: ParsedOutput }>({}),
    captureNotice = ref('')
  const differences = computed(() =>
    captures.value.before && captures.value.after
      ? compareOutputs(captures.value.before, captures.value.after)
      : [],
  )
  let generation = 0
  onBeforeUnmount(() => generation++)
  onMounted(async () => {
    try {
      const loaded = loadCollection('standAttempts', await readStandAttempts(), standAttemptSchema)
      saved.value = loaded.valid
      if (loaded.problems.length)
        error.value = `Проблемные отчёты: ${loaded.problems.length}; исходные записи доступны в настройках.`
      savedDrafts.value = loadCollection('drafts', await readDrafts(), draftSchema).valid.filter(
        (d) => d.kind === 'stand',
      )
    } catch {
      error.value = 'Отчёты стенда недоступны; можно экспортировать черновик.'
    }
  })
  watch(
    () => route.query.task,
    (id) => {
      if (standTasks.some((t) => t.id === id) && id !== taskId.value) {
        taskId.value = String(id)
        changeTask(true)
      }
    },
  )
  function changeTask(navigationConfirmed = false) {
    if (busy.value || (!navigationConfirmed && !confirmDiscardForms())) {
      taskId.value = previousTask.value
      return
    }
    previousTask.value = taskId.value
    draftId.value = globalThis.crypto.randomUUID()
    draftToken.value = null
    reportToken.value = null
    attemptId.value = globalThis.crypto.randomUUID()
    generation++
    notes.value = {
      platform: '',
      symptom: '',
      hypothesis: '',
      change: '',
      verification: '',
      answer: '',
      completedSteps: [],
    }
    captures.value = {}
    captureNotice.value = ''
    notice.value = ''
    consent.value = false
    markSaved()
  }
  function clearCaptures() {
    generation++
    captures.value = {}
    captureNotice.value = ''
  }
  function draft(): StandAttempt {
    return standAttemptSchema.parse({
      ...notes.value,
      taskId: task.value.id,
      id: draftId.value,
      attemptId: attemptId.value,
      storageToken: reportToken.value,
      at: new Date().toISOString(),
    })
  }
  async function save() {
    if (busy.value || !own.value || !isolated.value || !snapshot.value || !consent.value) return
    busy.value = true
    error.value = ''
    const before = JSON.stringify(notes.value),
      id = attemptId.value
    try {
      const value = draft()
      const stored = await saveStandAttempt(value)
      reportToken.value = stored.storageToken
      await useWorkshopStore().addEvent({
        attemptId: id,
        module: 'stand',
        taskId: value.taskId,
        skill: standTasks.find((t) => t.id === value.taskId)!.skill,
        at: value.at,
        score: null,
        outcome: 'self-reported',
      })
      saved.value = [...saved.value.filter((a) => a.id !== stored.id), stored]
      markSaved(before)
      notice.value =
        'Отчёт стенда сохранён. Это ваша запись о практике, без автоматической аттестации навыка.'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Не удалось сохранить отчёт.'
    } finally {
      busy.value = false
    }
  }
  function exportDraft() {
    try {
      downloadText(standMarkdown(draft()), 'workbench-stand-report.md')
    } catch {
      error.value = 'Заполните ОС, четыре поля разбора и самостоятельное объяснение.'
    }
  }
  function exportNotes() {
    const value = draftSchema.parse({
      id: draftId.value,
      storageToken: draftToken.value,
      attemptId: attemptId.value,
      kind: 'stand',
      taskId: taskId.value,
      at: new Date().toISOString(),
      notes: {
        ...notes.value,
        completedSteps: JSON.stringify(notes.value.completedSteps),
        reportStorageToken: reportToken.value ?? '',
      },
    })
    downloadText(
      JSON.stringify(value, null, 2),
      'workbench-stand-notes.json',
      'application/json;charset=utf-8',
    )
  }
  async function read(event: Event, side: 'before' | 'after') {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0]
    if (!file) return
    const current = ++generation
    captures.value = { ...captures.value, [side]: undefined }
    captureNotice.value = ''
    try {
      if (file.size > 262144) throw new Error('Лимит учебного вывода: 256 KiB.')
      const text = await file.text(),
        detected = detectCommand(text)
      if (detected.kind === 'unknown')
        throw new Error(
          'Этот формат не разбирается автоматически. Опишите наблюдения в отчёте; команды стенда выполняются вручную.',
        )
      const result = analyzeOutput(text, detected.kind)
      if (!result.parse.value)
        throw new Error('Вывод не распознан полностью. Проверьте формат и обезличивание.')
      const other = captures.value[side === 'before' ? 'after' : 'before']
      if (
        other &&
        (other.kind !== result.parse.value.kind ||
          (other.kind === 'powershell' &&
            result.parse.value.kind === 'powershell' &&
            other.cmdlet !== result.parse.value.cmdlet))
      )
        throw new Error('Для сравнения выберите выводы одной команды.')
      if (current === generation) {
        captures.value = { ...captures.value, [side]: result.parse.value }
        captureNotice.value = `Разобран ${detected.kind}. Вывод находится только в памяти; в отчёт и копию не попадёт.`
      }
    } catch (e) {
      if (current === generation)
        error.value = e instanceof Error ? e.message : 'Вывод не поддерживается.'
    } finally {
      input.value = ''
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Удалить сохранённый отчёт стенда?')) return
    try {
      await deleteStandAttempt(id)
      saved.value = saved.value.filter((a) => a.id !== id)
    } catch {
      error.value = 'Удаление не удалось.'
    }
  }
  async function saveNotes() {
    if (!consent.value || busy.value) return
    busy.value = true
    error.value = ''
    const before = JSON.stringify(notes.value)
    try {
      const value = draftSchema.parse({
        id: draftId.value,
        storageToken: draftToken.value,
        attemptId: attemptId.value,
        kind: 'stand',
        taskId: taskId.value,
        at: new Date().toISOString(),
        notes: {
          ...notes.value,
          completedSteps: JSON.stringify(notes.value.completedSteps),
          reportStorageToken: reportToken.value ?? '',
        },
      })
      const stored = await saveDraft(value)
      draftToken.value = stored.storageToken
      savedDrafts.value = [...savedDrafts.value.filter((d) => d.id !== stored.id), stored]
      markSaved(before)
      notice.value = 'Учебный черновик стенда сохранён без исходных файлов.'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Черновик не сохранён.'
    } finally {
      busy.value = false
    }
  }
  async function resumeDraft(id: string) {
    if (busy.value || !confirmDiscardForms()) return
    const parsed = draftSchema.safeParse(await getDraft(id).catch(() => undefined))
    const d = parsed.success ? parsed.data : undefined
    if (!d) {
      error.value = 'Черновик удалён или недоступен; текущие заметки можно экспортировать.'
      return
    }
    error.value = ''
    draftId.value = d.id
    draftToken.value = d.storageToken
    reportToken.value = d.notes.reportStorageToken || null
    attemptId.value = d.attemptId
    taskId.value = d.taskId
    previousTask.value = d.taskId
    notes.value = {
      platform: d.notes.platform ?? '',
      symptom: d.notes.symptom ?? '',
      hypothesis: d.notes.hypothesis ?? '',
      change: d.notes.change ?? '',
      verification: d.notes.verification ?? '',
      answer: d.notes.answer ?? '',
      completedSteps: [],
    }
    // Notes are untrusted imports; malformed step JSON cannot block restoring the text.
    try {
      const steps = JSON.parse(d.notes.completedSteps ?? '[]')
      if (Array.isArray(steps) && steps.every((i) => Number.isInteger(i) && i >= 0 && i < 4))
        notes.value.completedSteps = [...new Set(steps)]
    } catch {
      /* continue with text */
    }
    consent.value = false
    captures.value = {}
    markSaved()
  }
  async function resumeReport(id: string) {
    if (busy.value || !confirmDiscardForms()) return
    const parsed = standAttemptSchema.safeParse(await getStandAttempt(id).catch(() => undefined))
    if (!parsed.success) {
      error.value = 'Сохранённый отчёт стенда недоступен.'
      return
    }
    const a = parsed.data
    draftId.value = a.id
    attemptId.value = a.attemptId ?? a.id
    reportToken.value = a.storageToken
    draftToken.value = null
    taskId.value = a.taskId
    previousTask.value = a.taskId
    notes.value = {
      platform: a.platform,
      symptom: a.symptom,
      hypothesis: a.hypothesis,
      change: a.change,
      verification: a.verification,
      answer: a.answer,
      completedSteps: [...a.completedSteps],
    }
    captures.value = {}
    consent.value = false
    error.value = ''
    markSaved()
  }

  return {
    taskId,
    task,
    own,
    isolated,
    snapshot,
    consent,
    busy,
    error,
    notice,
    notes,
    draftId,
    savedDrafts,
    saved,
    revealed,
    captures,
    captureNotice,
    differences,
    changeTask,
    clearCaptures,
    save,
    exportDraft,
    exportNotes,
    read,
    remove,
    saveNotes,
    resumeDraft,
    resumeReport,
  }
}
