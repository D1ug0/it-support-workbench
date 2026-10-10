import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import Dexie, { type Table } from 'dexie'
import {
  emptyWorkshop,
  workshopProgressSchema,
  attemptSchema,
  type WorkshopProgress,
} from './skills'
import { reportSchema, type PortfolioReport } from './portfolio'
import { graphSchema, type IncidentGraph } from './graph'
import { topologySchema, type LabDefinition } from '../terminal/networkModel'
import { customCourseSchema, validateCourseLinks, type CustomCourse } from './customCourses'
import { labIds } from '../terminal/catalog'
const preferenceKey = 'it-workbench-workshop-save'
function preference() {
  try {
    return globalThis.localStorage?.getItem(preferenceKey)
  } catch {
    return null
  }
}
const db = new Dexie('it-support-workbench-workshop')
db.version(1).stores({ settings: 'id', labs: 'id', graphs: 'id', reports: 'id,at' })
db.version(2).stores({ courses: 'id' })
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
  function initialize() {
    return (initialization ??= (async () => {
      try {
        const loaded = await Promise.allSettled([
          settings.get('progress'),
          labs.toArray(),
          graphs.toArray(),
          reports.toArray(),
          courses.toArray(),
        ])
        const [savedResult, labResult, graphResult, reportResult, courseResult] = loaded
        if (savedResult.status === 'fulfilled' && savedResult.value) {
          revision = savedResult.value.revision ?? 0
          const valid = workshopProgressSchema.safeParse(savedResult.value.value)
          if (valid.success) {
            state.value = valid.data
            enabled.value = preference() === 'false' ? false : (savedResult.value.enabled ?? true)
          } else
            error.value =
              'Сохранённый прогресс повреждён. Данные не перезаписаны; используйте резервный JSON.'
        }
        if (labResult.status === 'fulfilled')
          for (const l of labResult.value) {
            const valid = topologySchema.safeParse(l.value)
            if (valid.success) customLabs.value = [...customLabs.value, valid.data]
            else error.value = 'Есть повреждённые лаборатории: они пропущены, остальные доступны.'
          }
        if (graphResult.status === 'fulfilled')
          for (const g of graphResult.value) {
            const valid = graphSchema.safeParse(g.value)
            if (valid.success) customGraphs.value = [...customGraphs.value, valid.data]
            else error.value = 'Есть повреждённые сценарии: они пропущены, остальные доступны.'
          }
        if (reportResult.status === 'fulfilled')
          for (const r of reportResult.value) {
            const valid = reportSchema.safeParse(r)
            if (valid.success) portfolio.value = [...portfolio.value, valid.data]
            else error.value = 'Есть повреждённые отчёты: они пропущены, остальные доступны.'
          }
        if (courseResult.status === 'fulfilled')
          for (const c of courseResult.value) {
            const valid = customCourseSchema.safeParse(c.value)
            if (valid.success) customCourses.value = [...customCourses.value, valid.data]
            else error.value = 'Есть повреждённые курсы: они пропущены, остальные доступны.'
          }
        if (loaded.some((r) => r.status === 'rejected'))
          error.value =
            'Хранилище практикума недоступно. Можно работать в памяти и экспортировать JSON.'
      } catch {
        error.value = 'Не удалось прочитать практикум. Сохранённые записи не изменены.'
      } finally {
        ready.value = true
      }
    })())
  }
  function persist() {
    if (preference() === 'false') enabled.value = false
    if (!enabled.value) return Promise.resolve()
    const snapshot = workshopProgressSchema.parse(state.value)
    queue = queue
      .then(() =>
        db.transaction('rw', settings, async () => {
          const current = await settings.get('progress')
          if ((current?.revision ?? 0) !== revision)
            throw new Error(
              'Прогресс изменён в другой вкладке. Экспортируйте текущую попытку и перечитайте сохранённую версию.',
            )
          const next = revision + 1
          await settings.put({ id: 'progress', value: snapshot, enabled: true, revision: next })
          revision = next
        }),
      )
      .then(() => {})
      .catch((cause: unknown) => {
        error.value =
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить практикум. Экспортируйте JSON.'
      })
    return queue
  }
  async function record(value: unknown) {
    await initialize()
    const valid = attemptSchema.parse(value)
    state.value = { ...state.value, attempts: [...state.value.attempts, valid].slice(-500) }
    await persist()
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
    await db.transaction('rw', labs, async () => {
      const existing = await labs.toArray()
      const merged = [
        ...existing.filter((l) => !valid.some((v) => v.id === l.id)),
        ...valid.map((value) => ({ id: value.id, value })),
      ]
      if (merged.length > 20) throw new Error('Лимит: 20 собственных лабораторий.')
      await labs.bulkPut(valid.map((value) => ({ id: value.id, value })))
    })
    customLabs.value = (await labs.toArray()).map((l) => topologySchema.parse(l.value))
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
    await db.transaction('rw', courses, labs, async () => {
      const availableLabs = [...labIds, ...(await labs.toArray()).map((l) => l.id)]
      validateCourseLinks(valid, availableLabs)
      const existing = await courses.toArray()
      if (existing.filter((c) => !valid.some((v) => v.id === c.id)).length + valid.length > 20)
        throw new Error('Лимит: 20 авторских курсов.')
      await courses.bulkPut(valid.map((value) => ({ id: value.id, value })))
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
    await db.transaction('rw', graphs, async () => {
      if ((await graphs.count()) >= 20 && !(await graphs.get(valid.id)))
        throw new Error('Лимит: 20 сценариев.')
      await graphs.put({ id: valid.id, value: valid })
    })
    customGraphs.value = (await graphs.toArray()).map((g) => graphSchema.parse(g.value))
  }
  async function removeGraph(id: string) {
    await graphs.delete(id)
    customGraphs.value = customGraphs.value.filter((g) => g.id !== id)
  }
  async function saveReport(value: PortfolioReport) {
    await initialize()
    const valid = reportSchema.parse(value)
    await db.transaction('rw', reports, async () => {
      if ((await reports.count()) >= 50 && !(await reports.get(valid.id)))
        throw new Error('Лимит: 50 отчётов.')
      await reports.put(valid)
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
    const saved = await settings.get('progress')
    state.value = saved ? workshopProgressSchema.parse(saved.value) : emptyWorkshop()
    revision = saved?.revision ?? 0
    enabled.value = preference() === 'false' ? false : (saved?.enabled ?? Boolean(saved))
    error.value = ''
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
    initialize,
    record,
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
  }
})
