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
  function initialize(): Promise<void> {
    return (initialization ??= (async () => {
      try {
        const { readProgress } = await import('./repository')
        const saved = await readProgress()
        if (saved) {
          state.value = saved.state
          enabled.value = saved.enabled
        }
      } catch {
        error.value = 'Хранилище прогресса недоступно. Обучение продолжится в памяти вкладки.'
      } finally {
        ready.value = true
      }
    })())
  }
  function persist() {
    const snapshot = structuredClone(state.value)
    const saveEnabled = enabled.value
    pendingWrites.value++
    queue = queue
      .then(async () => {
        const { writeProgress } = await import('./repository')
        await writeProgress(saveEnabled, snapshot)
      })
      .catch(() => {
        error.value =
          'Не удалось сохранить прогресс. Экспортируйте его; проверьте разрешения браузера.'
      })
      .finally(() => {
        pendingWrites.value--
      })
    return queue
  }
  async function answer(id: string, correct: boolean) {
    await initialize()
    state.value = recordAnswer(state.value, id, correct)
    if (enabled.value) await persist()
  }
  async function complete(id: string, score: number) {
    await initialize()
    state.value = recordScenario(state.value, id, score)
    if (enabled.value) await persist()
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
  async function clear() {
    await initialize()
    await queue
    try {
      const { deleteProgress } = await import('./repository')
      await deleteProgress()
      state.value = emptyProgress()
      enabled.value = false
      error.value = ''
    } catch {
      error.value = 'Не удалось удалить сохранённый прогресс.'
    }
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
    clear,
  }
})
