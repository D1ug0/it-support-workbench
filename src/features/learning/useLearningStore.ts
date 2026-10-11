import { taskSkill } from '../workshop/competencies'
import { taskErrorIds } from '../workshop/learningErrors'
import type { SaveResult } from '../../shared/persistence'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { emptyProgress, progressSchema, recordAnswer, recordScenario } from './progress'
import type { LearningProgress } from './progress'
export const useLearningStore = defineStore('learning', () => {
  const state = shallowRef(emptyProgress())
  const enabled = ref(false)
  const error = ref('')
  const ready = ref(false)
  const pendingWrites = ref(0)
  const saving = computed(() => pendingWrites.value > 0)
  let initialization: Promise<void> | undefined
  let queue = Promise.resolve()
  let revision = 0
  function initialize(): Promise<void> {
    return (initialization ??= (async () => {
      try {
        const { readProgress } = await import('./repository')
        const saved = await readProgress()
        if (saved) {
          state.value = saved.state
          enabled.value = saved.enabled
          revision = saved.revision
        }
      } catch {
        error.value = 'Хранилище прогресса недоступно. Обучение продолжится в памяти вкладки.'
      } finally {
        ready.value = true
      }
    })())
  }
  function persist(): Promise<SaveResult> {
    const snapshot = structuredClone(state.value),
      saveEnabled = enabled.value
    pendingWrites.value++
    const operation = queue.then(async (): Promise<SaveResult> => {
      try {
        const { writeProgress } = await import('./repository')
        revision = await writeProgress(saveEnabled, snapshot, revision)
        error.value = ''
        return { status: 'saved' }
      } catch (cause) {
        error.value =
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить базовый журнал. Экспортируйте попытку; при нехватке места удалите выбранные данные в настройках.'
        return { status: 'failed', error: error.value }
      } finally {
        pendingWrites.value--
      }
    })
    queue = operation.then(() => {})
    return operation
  }
  async function answer(id: string, correct: boolean) {
    await initialize()
    const attemptId = globalThis.crypto.randomUUID()
    state.value = recordAnswer(state.value, id, correct, Date.now(), attemptId)
    // Reserve this snapshot immediately; the independent workshop journal may still be loading.
    const baseSave = enabled.value ? persist() : undefined
    const { useWorkshopStore } = await import('../workshop/useWorkshopStore')
    const skill = taskSkill(id)
    if (skill)
      await useWorkshopStore().recordTheory({
        taskId: id,
        skill,
        form: 'choice',
        correct,
        at: new Date().toISOString(),
      })
    await useWorkshopStore().addEvent({
      attemptId,
      module: id.startsWith('ADV-') ? 'academy' : 'question',
      skill: taskSkill(id),
      taskId: id,
      at: new Date().toISOString(),
      score: correct ? 100 : 0,
      outcome: correct ? 'completed' : 'failed',
      errors: correct ? [] : ['Повторите объяснение вопроса и вернитесь к проверке.'],
      errorIds: correct ? [] : taskErrorIds(id.startsWith('ADV-') ? 'academy' : 'question', id),
    })
    await baseSave
  }
  async function complete(id: string, score: number, terminalAttempt?: string) {
    await initialize()
    const attemptId = terminalAttempt ?? globalThis.crypto.randomUUID()
    state.value = recordScenario(state.value, id, score, Date.now(), attemptId)
    const baseSave = enabled.value ? persist() : Promise.resolve<SaveResult>({ status: 'memory' })
    if (!terminalAttempt) {
      const { useWorkshopStore } = await import('../workshop/useWorkshopStore')
      const skill = taskSkill(id)
      if (skill && id.startsWith('PRACTICE-subnet-'))
        await useWorkshopStore().recordTheory({
          taskId: id,
          skill,
          form: 'calculation',
          correct: score >= 85,
          at: new Date().toISOString(),
        })
      await useWorkshopStore().addEvent({
        attemptId,
        module: id.startsWith('PRACTICE-')
          ? 'practice'
          : id.startsWith('LAB-')
            ? 'academy'
            : 'simulator',
        skill: taskSkill(id),
        taskId: id,
        at: new Date().toISOString(),
        score,
        outcome: score >= 85 ? 'completed' : 'failed',
      })
    }
    return baseSave
  }
  async function setEnabled(value: boolean) {
    await initialize()
    enabled.value = value
    error.value = ''
    await persist()
  }
  async function replace(value: LearningProgress) {
    await initialize()
    // Zod validates and produces plain data even when the preview is a Vue proxy.
    state.value = progressSchema.parse(value)
    if (enabled.value) await persist()
  }
  async function setGoal(value: number) {
    await initialize()
    state.value = progressSchema.parse({ ...state.value, weeklyGoal: value })
    if (enabled.value) await persist()
  }
  async function clear() {
    await initialize()
    await queue
    try {
      const { deleteProgress } = await import('./repository')
      await deleteProgress()
      state.value = emptyProgress()
      enabled.value = false
      revision = 0
      error.value = ''
    } catch {
      error.value = 'Не удалось удалить сохранённый прогресс.'
    }
  }
  async function flush() {
    await initialize()
    await queue
  }
  async function reloadSaved() {
    await flush()
    const { readProgress } = await import('./repository')
    const saved = await readProgress()
    state.value = saved?.state ?? emptyProgress()
    enabled.value = saved?.enabled ?? false
    revision = saved?.revision ?? 0
    error.value = ''
  }
  return {
    state,
    enabled,
    error,
    ready,
    saving,
    initialize,
    answer,
    complete,
    setEnabled,
    replace,
    setGoal,
    clear,
    flush,
    reloadSaved,
  }
})
