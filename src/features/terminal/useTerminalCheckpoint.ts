import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { downloadText } from '../../infrastructure/export/exportReport'
import { parseCheckpoint, type Checkpoint } from './checkpoint'

interface CheckpointWorkspace {
  snapshot: () => Checkpoint
  scope: () => string
  selectedId: () => string | undefined
}

/** Explicit persistence only; late IO must never replace a newer workspace. */
export function useTerminalCheckpoint(workspace: CheckpointWorkspace) {
  const pending = shallowRef<Checkpoint>()
  const consent = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  let generation = 0
  let disposed = false
  function invalidate() {
    generation++
    busy.value = false
    pending.value = undefined
    error.value = ''
    notice.value = ''
  }
  function begin() {
    const token = ++generation
    const scope = workspace.scope()
    busy.value = true
    pending.value = undefined
    error.value = ''
    notice.value = ''
    return () => !disposed && generation === token && workspace.scope() === scope
  }
  watch(workspace.scope, invalidate, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    generation++
  })

  async function load(id: string) {
    if (busy.value || disposed) return
    const current = begin()
    try {
      if (!id || id.length > 80) throw new Error('Некорректный ID контрольной точки.')
      const repository = await import('./repository')
      if (!current()) return
      const value = await repository.loadCheckpoint(id)
      if (!current()) return
      pending.value = value
      notice.value = value
        ? 'Проверьте контрольную точку перед восстановлением.'
        : 'Для этой лаборатории нет контрольной точки.'
    } catch (cause) {
      if (current())
        error.value =
          cause instanceof Error && cause.message === 'Некорректный ID контрольной точки.'
            ? cause.message
            : 'Не удалось прочитать контрольную точку. Можно импортировать ранее скачанный JSON.'
    } finally {
      if (current()) busy.value = false
    }
  }
  watch(
    workspace.selectedId,
    (id) => {
      invalidate()
      if (id !== undefined) void load(id)
    },
    { immediate: true },
  )

  async function local(action: 'save' | 'load' | 'delete') {
    if (busy.value || disposed) return
    if (action === 'save' && !consent.value) {
      error.value = 'Подтвердите сохранение состояния учебной среды.'
      return
    }
    // Capture the exact attempt before the first await, including for the lab ID.
    const snapshot = workspace.snapshot()
    if (action === 'load') return load(snapshot.environment.labId)
    const current = begin()
    try {
      const repository = await import('./repository')
      if (!current()) return
      if (action === 'save') {
        await repository.saveCheckpoint(snapshot)
        if (current())
          notice.value = 'Контрольная точка сохранена. Команды и вывод не записывались.'
      } else {
        await repository.deleteCheckpoint(snapshot.environment.labId)
        if (current()) notice.value = 'Контрольная точка этой лаборатории удалена.'
      }
    } catch (cause) {
      if (current())
        error.value =
          cause instanceof Error && cause.message.startsWith('Лимит:')
            ? cause.message
            : 'Хранилище недоступно. Можно скачать контрольную точку JSON и импортировать позже.'
    } finally {
      if (current()) busy.value = false
    }
  }
  async function read(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Allow choosing the same file again, also after an error.
    input.value = ''
    if (!file || busy.value || disposed) return
    const current = begin()
    try {
      if (file.size > 65536) throw new Error('Файл превышает 64 KiB.')
      const value = parseCheckpoint(await file.text())
      if (current()) pending.value = value
    } catch (cause) {
      if (current()) error.value = cause instanceof Error ? cause.message : 'Ошибка импорта.'
    } finally {
      if (current()) busy.value = false
    }
  }
  function exportCheckpoint() {
    const snapshot = workspace.snapshot()
    downloadText(
      JSON.stringify(snapshot, null, 2),
      `workbench-${snapshot.environment.labId}.json`,
      'application/json;charset=utf-8',
    )
  }
  return { pending, consent, busy, error, notice, local, read, exportCheckpoint }
}
