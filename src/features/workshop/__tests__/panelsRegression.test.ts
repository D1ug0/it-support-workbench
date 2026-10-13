// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Component } from 'vue'
import BaselinePanel from '../ui/learning/BaselinePanel.vue'
import CoursesPanel from '../ui/learning/CoursesPanel.vue'
import InvestigationPanel from '../ui/investigation/InvestigationPanel.vue'
import LabEditor from '../ui/authoring/LabEditor.vue'
import CourseEditor from '../ui/authoring/CourseEditor.vue'
import GraphEditor from '../ui/authoring/GraphEditor.vue'
import { useWorkshopStore } from '../model/useWorkshopStore'
import { reportSchema } from '../domain/portfolio'
import { drafts } from '../infrastructure/draftRepository'
import { workshopCourses } from '../domain/courses'
import type { SaveResult } from '../../../shared/persistence'
import { confirmDiscardForms } from '../../../shared/unsavedChanges'
const wrappers: VueWrapper[] = []
beforeEach(() => {
  setActivePinia(createPinia())
  const store = useWorkshopStore()
  vi.spyOn(store, 'initialize').mockResolvedValue()
  store.ready = true
  vi.spyOn(drafts, 'toArray').mockResolvedValue([])
})
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
})
async function panel(component: Component, query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/learning', component: { template: '<div />' } },
      { path: '/terminal', component: { template: '<div />' } },
    ],
  })
  await router.push('/learning' + query)
  const wrapper = shallowMount(component, {
    global: { plugins: [router], stubs: { RouterLink: true } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
describe('delayed result regressions', () => {
  it('a double click cannot skip the second baseline question', async () => {
    const store = useWorkshopStore()
    let release!: (result: SaveResult) => void
    vi.spyOn(store, 'setAssessment').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const w = await panel(BaselinePanel)
    const vm = w.vm as unknown as {
      startBaseline: () => void
      baselineAnswer: (index?: number) => Promise<void>
      baselineIndex: number
    }
    vm.startBaseline()
    const first = vm.baselineAnswer(0),
      duplicate = vm.baselineAnswer(1)
    expect(store.setAssessment).toHaveBeenCalledTimes(1)
    release({ status: 'saved' })
    await Promise.all([first, duplicate])
    expect(vm.baselineIndex).toBe(1)
  })
  it('a switched course keeps the original answer and a single result payload', async () => {
    const store = useWorkshopStore()
    let release!: (result: SaveResult) => void
    vi.spyOn(store, 'recordResult').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    vi.spyOn(store, 'selectLesson').mockResolvedValue({ status: 'memory' })
    const w = await panel(CoursesPanel)
    const vm = w.vm as unknown as {
      openCourse: (id: string) => void
      answer: (index: number) => Promise<void>
      choice: number | undefined
      course: { id: string }
    }
    vm.openCourse('DNS')
    const answer = vm.answer(workshopCourses.find((c) => c.id === 'DNS')!.correct)
    vm.openCourse('ADDRESS')
    release({ status: 'saved' })
    await answer
    expect(store.recordResult).toHaveBeenCalledTimes(1)
    expect(vi.mocked(store.recordResult).mock.calls[0]![0]).toMatchObject({
      theory: { taskId: 'DNS', correct: true },
      event: { taskId: 'DNS', skill: 'dns' },
      assessment: true,
    })
    expect(vm.course.id).toBe('ADDRESS')
    expect(vm.choice).toBeUndefined()
    expect(w.text()).not.toContain('Результат сохранён.')
  })
  it('read marks use one lesson prefix and a failed write is not presented as saved', async () => {
    const store = useWorkshopStore()
    vi.spyOn(store, 'markRead').mockResolvedValue({
      status: 'failed',
      error: 'Запись отклонена из-за конфликта.',
    })
    const w = await panel(CoursesPanel)
    await (w.vm as unknown as { markRead: () => Promise<void> }).markRead()
    expect(store.markRead).toHaveBeenCalledWith('ADDRESS')
    expect(w.text()).toContain('Запись отклонена из-за конфликта.')
    expect(w.text()).not.toContain('Знакомство с материалом отмечено.')
  })
  it('an unavailable original lab keeps its report title, ID, time and score after saving', async () => {
    const store = useWorkshopStore(),
      original = reportSchema.parse({
        id: crypto.randomUUID(),
        title: 'Удалённая авторская лаборатория',
        labId: 'USR-deleted',
        at: '2026-10-01T10:00:00Z',
        attemptId: crypto.randomUUID(),
        symptom: 'Исходный симптом',
        hypothesis: '',
        evidence: '',
        change: '',
        verification: '',
        score: 95,
      })
    store.portfolio = [original]
    vi.spyOn(store, 'saveReport').mockImplementation(async (value) => ({
      ...value,
      storageToken: crypto.randomUUID(),
    }))
    const w = await panel(InvestigationPanel, `?report=${original.id}`)
    const vm = w.vm as unknown as { consent: boolean; save: () => Promise<void> }
    vm.consent = true
    await vm.save()
    expect(store.saveReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: original.title,
        labId: original.labId,
        at: original.at,
        attemptId: original.attemptId,
        score: original.score,
      }),
    )
  })
})
describe('author drafts', () => {
  it.each([LabEditor, CourseEditor, GraphEditor])(
    'protects unsaved material when leaving the editor',
    async (component) => {
      const w = await panel(component)
      const vm = w.vm as unknown as { draft?: { title: string }; text?: string }
      if (component === LabEditor) vm.draft!.title = 'Несохранённая правка'
      else vm.text += '\n '
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      expect(confirmDiscardForms({ path: '/terminal', query: {} })).toBe(false)
      expect(window.confirm).toHaveBeenCalledTimes(1)
    },
  )
})
