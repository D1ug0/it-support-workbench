import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { SaveResult } from '../../../shared/persistence'
import { loadCollection, type ProblemRecord } from '../../../shared/persistence/collectionLoader'
import {
  emptyWorkshop,
  workshopProgressSchema,
  attemptSchema,
  theoryCheckSchema,
  type SkillId,
} from '../domain/skills'
import { reportSchema, type PortfolioReport } from '../domain/portfolio'
import { graphSchema, type IncidentGraph } from '../domain/graph'
import { topologySchema, type LabDefinition } from '../../terminal/networkModel'
import { customCourseSchema, validateCourseLinks, type CustomCourse } from '../domain/customCourses'
import { labIds } from '../../terminal/catalog'
import { tokensFromRows } from '../application/materialTokens'
import type {
  WorkshopRepository,
  MaterialTokens,
  MaterialCollection,
} from '../application/workshopRepository'
import { workshopRepository } from '../infrastructure/workshopRepository'
import {
  learningResultSchema,
  applyLearningResult,
  appendTerminalResult,
} from '../domain/progressCommands'
import { beginRemediation, answerRemediation } from '../domain/remediation'
import type { LearningErrorId } from '../domain/learningErrors'
const preferenceKey = 'it-workbench-workshop-save'
function preference() {
  try {
    return globalThis.localStorage?.getItem(preferenceKey)
  } catch {
    return null
  }
}
export function createWorkshopStore(repository: WorkshopRepository) {
  return defineStore('learning-workshop', () => {
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
    const materialTokens = shallowRef<Record<MaterialCollection, MaterialTokens>>({
      labs: {},
      courses: {},
      graphs: {},
    })
    function tokensFor(collection: MaterialCollection, ids: readonly string[]) {
      return Object.fromEntries(ids.map((id) => [id, materialTokens.value[collection][id] ?? null]))
    }
    const pendingWrites = ref(0)
    const saving = computed(() => pendingWrites.value > 0)
    async function loadSaved() {
      const loaded = await repository.read()
      const [saved, l, g, r, c] = loaded
      for (const [name, result] of [
        ['labs', l],
        ['graphs', g],
        ['courses', c],
      ] as const)
        if (result.status === 'fulfilled') materialTokens.value[name] = tokensFromRows(result.value)
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
          revision = await repository.saveProgress(snapshot, revision)
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
      state.value = appendTerminalResult(
        state.value,
        valid,
        valid.attemptId ?? globalThis.crypto.randomUUID(),
      )
      return persist()
    }
    async function recordResult(value: unknown): Promise<SaveResult> {
      const result = learningResultSchema.parse(value)
      await initialize()
      state.value = applyLearningResult(state.value, result)
      return persist()
    }
    async function addEvent(value: unknown) {
      return recordResult({ event: value })
    }
    async function recordTheory(value: unknown) {
      await initialize()
      const check = theoryCheckSchema.parse(value)
      state.value = {
        ...state.value,
        theoryChecks: [...state.value.theoryChecks, check].slice(-300),
      }
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
      const snapshot = workshopProgressSchema.parse(value)
      await initialize()
      state.value = snapshot
      return persist()
    }
    async function setAssessment(skill: SkillId, correct: boolean) {
      await initialize()
      state.value = workshopProgressSchema.parse({
        ...state.value,
        assessment: { ...state.value.assessment, [skill]: correct },
      })
      return persist()
    }
    async function markRead(id: string) {
      await initialize()
      state.value = workshopProgressSchema.parse({
        ...state.value,
        read: [...new Set([...state.value.read, `LESSON-${id}`])],
      })
      return persist()
    }
    async function selectTrack(track: string) {
      await initialize()
      state.value = workshopProgressSchema.parse({ ...state.value, track })
      return persist()
    }
    async function selectLesson(id: string) {
      await initialize()
      state.value = workshopProgressSchema.parse({ ...state.value, currentLesson: id })
      return persist()
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
            const nextRevision = await repository.disableProgress()
            if (nextRevision !== undefined) revision = nextRevision
          })
          .catch(() => {
            error.value = 'Не удалось сохранить отключение записи.'
          })
        await queue
      }
    }
    async function saveLabs(values: LabDefinition[], expected?: MaterialTokens) {
      await initialize()
      const valid = values.map((v) => topologySchema.parse(v))
      const saved = await repository.saveMaterials(
        'labs',
        valid,
        expected ??
          tokensFor(
            'labs',
            valid.map((v) => v.id),
          ),
      )
      materialTokens.value.labs = { ...materialTokens.value.labs, ...saved }
      customLabs.value = loadCollection(
        'labs',
        await repository.readMaterials('labs'),
        topologySchema,
        true,
      ).valid
      return saved
    }
    async function removeLab(id: string) {
      await initialize()
      await repository.deleteMaterial('labs', id, materialTokens.value.labs[id] ?? null)
      materialTokens.value = {
        ...materialTokens.value,
        labs: { ...materialTokens.value.labs, [id]: null },
      }
      customLabs.value = customLabs.value.filter((l) => l.id !== id)
    }
    async function saveCourses(values: CustomCourse[], expected?: MaterialTokens) {
      await initialize()
      const valid = values.map((v) => customCourseSchema.parse(v))
      const saved = await repository.saveMaterials(
        'courses',
        valid,
        expected ??
          tokensFor(
            'courses',
            valid.map((v) => v.id),
          ),
      )
      materialTokens.value.courses = { ...materialTokens.value.courses, ...saved }
      customCourses.value = loadCollection(
        'courses',
        await repository.readMaterials('courses'),
        customCourseSchema,
        true,
      ).valid
      return saved
    }
    async function removeCourse(id: string) {
      await initialize()
      await repository.deleteMaterial('courses', id, materialTokens.value.courses[id] ?? null)
      materialTokens.value = {
        ...materialTokens.value,
        courses: { ...materialTokens.value.courses, [id]: null },
      }
      customCourses.value = customCourses.value.filter((c) => c.id !== id)
    }
    async function saveGraph(value: IncidentGraph, expected?: MaterialTokens) {
      await initialize()
      const valid = graphSchema.parse(value)
      const saved = await repository.saveMaterials(
        'graphs',
        [valid],
        expected ?? tokensFor('graphs', [valid.id]),
      )
      materialTokens.value.graphs = { ...materialTokens.value.graphs, ...saved }
      customGraphs.value = loadCollection(
        'graphs',
        await repository.readMaterials('graphs'),
        graphSchema,
        true,
      ).valid
      return saved
    }
    async function removeGraph(id: string) {
      await initialize()
      await repository.deleteMaterial('graphs', id, materialTokens.value.graphs[id] ?? null)
      materialTokens.value = {
        ...materialTokens.value,
        graphs: { ...materialTokens.value.graphs, [id]: null },
      }
      customGraphs.value = customGraphs.value.filter((g) => g.id !== id)
    }
    async function saveReport(value: PortfolioReport) {
      await initialize()
      const valid = reportSchema.parse(value)
      const stored = await repository.saveReport(valid)
      portfolio.value = [...portfolio.value.filter((r) => r.id !== stored.id), stored]
      return stored
    }
    async function removeReport(id: string) {
      await repository.removeReport(id)
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
      await repository.clearProgress()
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
      materialTokens,
      tokensFor,
      saving,
      initialize,
      record,
      addEvent,
      recordResult,
      setAssessment,
      markRead,
      selectTrack,
      selectLesson,
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
}

export const useWorkshopStore = createWorkshopStore(workshopRepository)
