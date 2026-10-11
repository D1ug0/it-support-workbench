import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { type Table } from 'dexie'
import type { SaveResult } from '../../shared/persistence'
import { loadCollection, type ProblemRecord } from './collectionLoader'
import { workshopDb as db, learningTables, assertStorageBudget } from './storage'
import {
  emptyWorkshop,
  workshopProgressSchema,
  attemptSchema,
  learningEventSchema,
  theoryCheckSchema,
  type WorkshopProgress,
} from './skills'
import { reportSchema, type PortfolioReport } from './portfolio'
import { graphSchema, type IncidentGraph } from './graph'
import { topologySchema, type LabDefinition } from '../terminal/networkModel'
import { customCourseSchema, validateCourseLinks, type CustomCourse } from './customCourses'
import { labIds } from '../terminal/catalog'
import { beginRemediation, answerRemediation } from './remediation'
import type { LearningErrorId } from './learningErrors'
const preferenceKey = 'it-workbench-workshop-save'
function preference() {
  try {
    return globalThis.localStorage?.getItem(preferenceKey)
  } catch {
    return null
  }
}
const settings: Table<
  { id: string; value: WorkshopProgress; enabled?: boolean; revision?: number },
  string
> = db.table('settings')
const labs: Table<{ id: string; value: LabDefinition }, string> = db.table('labs')
const graphs: Table<{ id: string; value: IncidentGraph }, string> = db.table('graphs')
const reports: Table<PortfolioReport, string> = db.table('reports')
const courses: Table<{ id: string; value: CustomCourse }, string> = db.table('courses')
export const useWorkshopStore = defineStore('learning-workshop', () => {
  const state = shallowRef(emptyWorkshop()),
    customLabs = shallowRef<LabDefinition[]>([]),
    customGraphs = shallowRef<IncidentGraph[]>([]),
    customCourses = shallowRef<CustomCourse[]>([]),
    portfolio = shallowRef<PortfolioReport[]>([])
  const enabled = ref(false),
    ready = ref(false),
    error = ref('')
  let initialization: Promise<void> | undefined,
    queue = Promise.resolve(),
    revision = 0
  const problems = shallowRef<ProblemRecord[]>([])
  const pendingWrites = ref(0)
  const saving = computed(() => pendingWrites.value > 0)
  async function loadSaved() {
    const loaded = await Promise.allSettled([
      settings.get('progress'),
      labs.toArray(),
      graphs.toArray(),
      reports.toArray(),
      courses.toArray(),
    ])
    const [saved, l, g, r, c] = loaded
    problems.value = []
    error.value = ''
    if (saved.status === 'fulfilled') {
      const row = saved.value
      const valid = row ? workshopProgressSchema.safeParse(row.value) : undefined
      revision = row?.revision ?? 0
      enabled.value = false
      if (valid?.success) {
        state.value = valid.data
        enabled.value = preference() !== 'false' && (row?.enabled ?? true)
      } else {
        state.value = emptyWorkshop()
        if (row)
          problems.value.push({
            collection: 'settings',
            id: 'progress',
            reason: 'Повреждённый прогресс',
            raw: row,
          })
      }
    } else {
      state.value = emptyWorkshop()
      enabled.value = false
    }
    function collect<T>(
      name: string,
      result: PromiseSettledResult<unknown[]>,
      schema: import('zod').z.ZodType<T>,
      unwrap = true,
    ) {
      if (result.status === 'rejected') return [] as T[]
      const parsed = loadCollection(name, result.value, schema, unwrap)
      problems.value.push(...parsed.problems)
      return parsed.valid
    }
    customLabs.value = collect('labs', l, topologySchema)
    customGraphs.value = collect('graphs', g, graphSchema)
    portfolio.value = collect('reports', r, reportSchema, false)
    const parsedCourses = collect('courses', c, customCourseSchema)
    customCourses.value = parsedCourses.filter((course) => {
      try {
        validateCourseLinks([course], [...labIds, ...customLabs.value.map((l) => l.id)])
        return true
      } catch {
        problems.value.push({
          collection: 'courses',
          id: course.id,
          reason: 'Недоступна связанная лаборатория; восстановите её.',
          raw: course,
        })
        return false
      }
    })
    if (problems.value.length)
      error.value = `Не прочитано записей: ${problems.value.length}. Исходные записи сохранены; доступен отдельный экспорт.`
    if (loaded.some((r) => r.status === 'rejected'))
      error.value += ' Хранилище недоступно; можно работать в памяти.'
  }
  function initialize() {
    return (initialization ??= loadSaved()
      .catch(() => {
        error.value = 'Хранилище недоступно; работа продолжается в памяти.'
        enabled.value = false
      })
      .finally(() => {
        ready.value = true
      }))
  }
  function persist(): Promise<SaveResult> {
    if (preference() === 'false') enabled.value = false
    if (!enabled.value) return Promise.resolve({ status: 'memory' })
    const snapshot = workshopProgressSchema.parse(state.value)
    pendingWrites.value++
    const operation = queue.then(async (): Promise<SaveResult> => {
      try {
        await db.transaction('rw', learningTables(), async () => {
          const current = await settings.get('progress')
          if ((current?.revision ?? 0) !== revision)
            throw new Error(
              'Прогресс изменён в другой вкладке. Экспортируйте попытку и перечитайте сохранённую версию.',
            )
          const next = revision + 1
          await settings.put({ id: 'progress', value: snapshot, enabled: true, revision: next })
          await assertStorageBudget()
        })
        revision++
        error.value = ''
        return { status: 'saved' }
      } catch (cause) {
        error.value =
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить практикум. Экспортируйте попытку; при нехватке места удалите выбранные данные в настройках.'
        return { status: 'failed', error: error.value }
      } finally {
        pendingWrites.value--
      }
    })
    queue = operation.then(() => {})
    return operation
  }
  async function record(value: unknown) {
    await initialize()
    const valid = attemptSchema.parse(value)
    if (valid.attemptId && state.value.attempts.some((a) => a.attemptId === valid.attemptId))
      return { status: 'memory' } as SaveResult
    state.value = { ...state.value, attempts: [...state.value.attempts, valid].slice(-500) }
    const event = learningEventSchema.parse({
      attemptId: valid.attemptId ?? globalThis.crypto.randomUUID(),
      module: 'terminal',
      taskId: valid.id,
      skill: valid.skill,
      at: valid.at,
      score: valid.score,
      outcome: valid.complete ? 'completed' : 'failed',
      errors: valid.errors ?? [],
    })
    state.value = { ...state.value, events: [...state.value.events, event].slice(-500) }
    return persist()
  }
  async function addEvent(value: unknown) {
    await initialize()
    const event = learningEventSchema.parse(value)
    if (
      !state.value.events.some((e) => e.attemptId === event.attemptId && e.module === event.module)
    )
      state.value = { ...state.value, events: [...state.value.events, event].slice(-500) }
    return persist()
  }
  async function recordTheory(value: unknown) {
    await initialize()
    const check = theoryCheckSchema.parse(value)
    state.value = { ...state.value, theoryChecks: [...state.value.theoryChecks, check].slice(-300) }
    return persist()
  }
  async function startErrorPractice(errorId: LearningErrorId) {
    await initialize()
    const result = beginRemediation(state.value, errorId)
    state.value = result.progress
    const saved = await persist()
    return { id: result.attempt.id, saved }
  }
  async function answerErrorPractice(id: string, step: number, choice: number) {
    await initialize()
    // Commit the answer and final event together, before awaiting persistence.
    const result = answerRemediation(state.value, id, step, choice)
    state.value = result.progress
    return persist()
  }
  async function replace(value: unknown) {
    await initialize()
    state.value = workshopProgressSchema.parse(value)
    await persist()
  }
  async function toggle(value: boolean) {
    try {
      globalThis.localStorage?.setItem(preferenceKey, String(value))
    } catch {
      /* IndexedDB remains the fallback preference store. */
    }
    await initialize()
    enabled.value = value
    if (value) await persist()
    else {
      queue = queue
        .then(async () => {
          await db.transaction('rw', settings, async () => {
            const current = await settings.get('progress')
            if (current) {
              await settings.update('progress', {
                enabled: false,
                revision: (current.revision ?? 0) + 1,
              })
              revision = (current.revision ?? 0) + 1
            }
          })
        })
        .catch(() => {
          error.value = 'Не удалось сохранить отключение записи.'
        })
      await queue
    }
  }
  async function saveLabs(values: LabDefinition[]) {
    await initialize()
    const valid = values.map((v) => topologySchema.parse(v))
    if (valid.some((l) => !l.id.startsWith('USR-')))
      throw new Error('Встроенные задания не перезаписываются.')
    if (new Set(valid.map((l) => l.id)).size !== valid.length)
      throw new Error('Повторяющиеся ID лабораторий.')
    await db.transaction('rw', learningTables(), async () => {
      const existing = await labs.toArray()
      const merged = [
        ...existing.filter((l) => !valid.some((v) => v.id === l.id)),
        ...valid.map((value) => ({ id: value.id, value })),
      ]
      if (merged.length > 20) throw new Error('Лимит: 20 собственных лабораторий.')
      await labs.bulkPut(valid.map((value) => ({ id: value.id, value })))
      await assertStorageBudget()
    })
    customLabs.value = (await labs.toArray()).flatMap((l) => {
      const valid = topologySchema.safeParse(l.value)
      return valid.success ? [valid.data] : []
    })
  }
  async function removeLab(id: string) {
    await db.transaction('rw', labs, courses, async () => {
      const linked = (await courses.toArray()).find((c) => {
        const valid = customCourseSchema.safeParse(c.value)
        return valid.success && valid.data.labs.includes(id)
      })
      if (linked)
        throw new Error(
          'Лаборатория используется авторским курсом. Сначала измените ссылки в курсе или удалите курс.',
        )
      await labs.delete(id)
    })
    customLabs.value = customLabs.value.filter((l) => l.id !== id)
  }
  async function saveCourses(values: CustomCourse[]) {
    await initialize()
    const valid = values.map((c) => customCourseSchema.parse(c))
    if (!valid.length || valid.length > 20 || new Set(valid.map((c) => c.id)).size !== valid.length)
      throw new Error('Пакет должен содержать от 1 до 20 уникальных курсов.')
    await db.transaction('rw', learningTables(), async () => {
      const availableLabs = [
        ...labIds,
        ...loadCollection('labs', await labs.toArray(), topologySchema, true).valid.map(
          (l) => l.id,
        ),
      ]
      validateCourseLinks(valid, availableLabs)
      const existing = await courses.toArray()
      if (existing.filter((c) => !valid.some((v) => v.id === c.id)).length + valid.length > 20)
        throw new Error('Лимит: 20 авторских курсов.')
      await courses.bulkPut(valid.map((value) => ({ id: value.id, value })))
      await assertStorageBudget()
    })
    customCourses.value = (await courses.toArray()).flatMap((c) => {
      const valid = customCourseSchema.safeParse(c.value)
      return valid.success ? [valid.data] : []
    })
  }
  async function removeCourse(id: string) {
    await courses.delete(id)
    customCourses.value = customCourses.value.filter((c) => c.id !== id)
  }
  async function saveGraph(value: IncidentGraph) {
    const valid = graphSchema.parse(value)
    await initialize()
    await db.transaction('rw', learningTables(), async () => {
      if ((await graphs.count()) >= 20 && !(await graphs.get(valid.id)))
        throw new Error('Лимит: 20 сценариев.')
      await graphs.put({ id: valid.id, value: valid })
      await assertStorageBudget()
    })
    customGraphs.value = (await graphs.toArray()).flatMap((g) => {
      const valid = graphSchema.safeParse(g.value)
      return valid.success ? [valid.data] : []
    })
  }
  async function removeGraph(id: string) {
    await graphs.delete(id)
    customGraphs.value = customGraphs.value.filter((g) => g.id !== id)
  }
  async function saveReport(value: PortfolioReport) {
    await initialize()
    const valid = reportSchema.parse(value)
    await db.transaction('rw', learningTables(), async () => {
      if ((await reports.count()) >= 50 && !(await reports.get(valid.id)))
        throw new Error('Лимит: 50 отчётов.')
      const previous = await reports.get(valid.id)
      if (previous && reportSchema.parse(previous).version >= valid.version)
        throw new Error('Отчёт изменён в другой вкладке. Перечитайте его перед редактированием.')
      await reports.put(valid)
      await assertStorageBudget()
    })
    portfolio.value = [...portfolio.value.filter((r) => r.id !== valid.id), valid]
  }
  async function removeReport(id: string) {
    await reports.delete(id)
    portfolio.value = portfolio.value.filter((r) => r.id !== id)
  }
  async function reloadSaved() {
    await initialize()
    await queue
    await loadSaved()
  }
  async function flush() {
    await initialize()
    await queue
  }
  async function clear() {
    await initialize()
    await queue
    try {
      globalThis.localStorage?.setItem(preferenceKey, 'false')
    } catch {
      /* No localStorage support. */
    }
    await settings.delete('progress')
    revision = 0
    state.value = emptyWorkshop()
    enabled.value = false
  }
  return {
    state,
    customLabs,
    customGraphs,
    customCourses,
    portfolio,
    enabled,
    ready,
    error,
    problems,
    saving,
    initialize,
    record,
    addEvent,
    recordTheory,
    startErrorPractice,
    answerErrorPractice,
    replace,
    toggle,
    saveLabs,
    removeLab,
    saveCourses,
    removeCourse,
    saveGraph,
    removeGraph,
    saveReport,
    removeReport,
    clear,
    reloadSaved,
    flush,
  }
})
