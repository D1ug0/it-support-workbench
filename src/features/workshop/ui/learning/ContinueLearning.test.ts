// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ContinueLearning from './ContinueLearning.vue'
import { useWorkshopStore } from '../../model/useWorkshopStore'
import { professionalAttemptSchema, startProfessional } from '../../domain/professional/index'
import { professionalAttempts } from '../../infrastructure/professionalRepository'
import { learningEventSchema } from '../../domain/skills'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.restoreAllMocks())
const mountPanel = () =>
  mount(ContinueLearning, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
describe('continue learning after storage loads', () => {
  it('recommends a newly recorded DNS error immediately without waiting for the minute timer', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-11T10:00:00Z'))
      const store = useWorkshopStore()
      store.ready = true
      vi.spyOn(store, 'initialize').mockResolvedValue()
      vi.spyOn(professionalAttempts, 'toArray').mockResolvedValue([])
      const wrapper = mountPanel()
      await flushPromises()
      vi.setSystemTime(new Date('2026-10-11T10:00:01Z'))
      store.state = {
        ...store.state,
        events: [
          learningEventSchema.parse({
            attemptId: crypto.randomUUID(),
            module: 'course',
            taskId: 'DNS',
            skill: 'dns',
            at: new Date().toISOString(),
            score: 0,
            outcome: 'failed',
          }),
        ],
      }
      await flushPromises()
      expect(wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))).toContain(
        '/learning?view=workshop&workshop=error-practice&error=dns-cache',
      )
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
  it('does not offer a task from empty progress while saved progress is still loading', async () => {
    const store = useWorkshopStore()
    let finish!: () => void
    vi.spyOn(store, 'initialize').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            store.state = { ...store.state, track: 'linux', currentLesson: 'LINUX' }
            store.ready = true
            resolve()
          }
        }),
    )
    vi.spyOn(professionalAttempts, 'toArray').mockResolvedValue([])
    const wrapper = mountPanel()
    expect(wrapper.get('[role="status"]').text()).toContain('Загружаем')
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(wrapper.get('section').attributes('aria-busy')).toBe('true')
    finish()
    await flushPromises()
    expect(wrapper.get('section').attributes('aria-busy')).toBe('false')
    expect(wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))).toContain(
      '/learning?lesson=LINUX',
    )
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('presents human titles, real dates, zero scores, errors and the latest active incident', async () => {
    const store = useWorkshopStore()
    store.ready = true
    vi.spyOn(store, 'initialize').mockResolvedValue()
    const early = startProfessional('portal', 0)
    const latest = { ...startProfessional('api', 1), updatedAt: '2026-10-11T11:00:00Z' }
    const closed = professionalAttemptSchema.parse({
      ...startProfessional('recovery', 0),
      status: 'completed',
      gradingVersion: 0,
      updatedAt: '2026-10-11T12:00:00Z',
    })
    vi.spyOn(professionalAttempts, 'toArray').mockResolvedValue([
      { ...early, updatedAt: '2026-10-11T09:00:00Z' },
      latest,
      closed,
    ])
    const first = learningEventSchema.parse({
      attemptId: '00000000-0000-4000-8000-000000000001',
      module: 'terminal',
      taskId: 'TERM-DNS-CACHE',
      skill: 'dns',
      score: 0,
      outcome: 'failed',
      at: '2026-10-11T10:00:00Z',
      errors: ['Сравните ответ DNS с кэшем.'],
    })
    const second = learningEventSchema.parse({
      ...first,
      attemptId: '00000000-0000-4000-8000-000000000002',
      module: 'stand',
      taskId: 'dns',
      score: null,
      outcome: 'self-reported',
      at: '2026-10-11T11:00:00Z',
      errors: [],
    })
    store.state = { ...store.state, events: [second, first] }
    const wrapper = mountPanel()
    await flushPromises()
    const rows = wrapper.findAll('.learning-event-list > li')
    expect(rows[0]!.text()).toContain('Windows: клиентский DNS и кэш')
    expect(rows[0]!.text()).toContain('Самостоятельный отчёт')
    expect(rows[0]!.text()).not.toContain('/ 100')
    expect(rows[1]!.text()).toContain('Устаревший DNS-кэш')
    expect(rows[1]!.text()).toContain('Нужна повторная попытка · 0 / 100')
    expect(rows[1]!.text()).toContain('Сравните ответ DNS с кэшем.')
    expect(rows[1]!.text()).not.toContain('TERM-DNS-CACHE')
    expect(rows[1]!.get('time').attributes('datetime')).toBe(first.at)
    const resume = wrapper
      .findAllComponents(RouterLinkStub)
      .find((link) => link.text() === 'Продолжить сохранённый инцидент')!
    expect(resume.props('to')).toBe(
      `/learning?view=workshop&workshop=professional&attempt=${latest.id}`,
    )
    wrapper.unmount()
  })
  it('keeps learning available and explains a failed incident read instead of claiming the list is empty', async () => {
    const store = useWorkshopStore()
    store.ready = true
    vi.spyOn(store, 'initialize').mockResolvedValue()
    vi.spyOn(professionalAttempts, 'toArray').mockRejectedValue(new Error('storage unavailable'))
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Не удалось прочитать сохранённые инциденты',
    )
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(true)
    expect(wrapper.text()).toContain('Начните занятие')
    wrapper.unmount()
  })
})
