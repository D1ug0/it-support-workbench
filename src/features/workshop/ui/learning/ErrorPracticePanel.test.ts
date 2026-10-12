// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useWorkshopStore } from '../../model/useWorkshopStore'
import { emptyWorkshop, learningEventSchema } from '../../domain/skills'
import ErrorPracticePanel from './ErrorPracticePanel.vue'
import {
  beginRemediation,
  answerRemediation,
  remediationReviewDelay,
} from '../../domain/remediation'
const { route, replace } = vi.hoisted(() => ({
  route: { query: { error: 'dns-cache' } },
  replace: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRoute: () => reactive(route), useRouter: () => ({ replace }) }))
const time = Date.parse('2026-10-11T10:00:00Z')
beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(time + 10)
  reactive(route).query.error = 'dns-cache'
  const store = useWorkshopStore()
  store.ready = true
  vi.spyOn(store, 'initialize').mockResolvedValue()
  store.state = {
    ...emptyWorkshop(),
    events: [
      learningEventSchema.parse({
        attemptId: '00000000-0000-4000-8000-000000000001',
        module: 'course',
        taskId: 'DNS',
        skill: 'dns',
        at: new Date(time).toISOString(),
        score: 0,
        outcome: 'failed',
        errors: ['Прямой запрос не доказывает кэш.'],
      }),
    ],
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function panel() {
  return mount(ErrorPracticePanel, { global: { stubs: { RouterLink: RouterLinkStub } } })
}
async function start(wrapper: ReturnType<typeof panel>) {
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Начать короткое занятие')!
    .trigger('click')
  await flushPromises()
}
async function choose(wrapper: ReturnType<typeof panel>, index: number) {
  await wrapper.findAll('.workshop-choices button')[index]!.trigger('click')
  await flushPromises()
}
describe('error practice UI', () => {
  it('shows the source, fixes the first answer, restores a partial session and distinguishes memory from saved', async () => {
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain(
      'Причина назначения: ошибка в задании «DNS: сервер, кэш и тип записи»',
    )
    await start(wrapper)
    await choose(wrapper, 1)
    expect(wrapper.text()).toContain('Первый ответ верный')
    expect(wrapper.text()).toContain('Результат в памяти вкладки')
    expect(
      wrapper
        .findAll('.workshop-choices button')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true)
    wrapper.unmount()
    const resumed = panel()
    await flushPromises()
    expect(resumed.text()).toContain('2 из 2')
    await choose(resumed, 2)
    expect(resumed.text()).toContain('Активное назначение закрыто')
    expect(resumed.text()).toContain('Обе задачи решены')
    expect(useWorkshopStore().state.events).toHaveLength(2)
    expect(resumed.text()).toContain('12 окт.')
    resumed.unmount()
  })
  it('hides review feedback until both first answers are committed and reopens practice on failure', async () => {
    const store = useWorkshopStore()
    const begun = beginRemediation(store.state, 'dns-cache', time)
    const first = answerRemediation(begun.progress, begun.attempt.id, 0, 1, time + 1)
    store.state = answerRemediation(first.progress, begun.attempt.id, 1, 2, time + 2).progress
    vi.setSystemTime(time + 3 + remediationReviewDelay)
    const wrapper = panel()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Начать отложенную проверку')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Согласованные наблюдения не подтверждают')
    await choose(wrapper, 0)
    expect(wrapper.text()).toContain('Разбор откроется после обеих задач')
    expect(wrapper.text()).not.toContain('Согласованные наблюдения не подтверждают')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'К выбору доказательства')!
      .trigger('click')
    await choose(wrapper, 0)
    expect(wrapper.text()).toContain('Нужен ещё один разбор')
    expect(wrapper.text()).toContain('Согласованные наблюдения не подтверждают')
    expect(wrapper.text()).toContain('Начать другую ситуацию')
    wrapper.unmount()
  })
  it('shows a failed write without claiming the answer was saved', async () => {
    const store = useWorkshopStore()
    const wrapper = panel()
    await flushPromises()
    await start(wrapper)
    const original = store.answerErrorPractice
    vi.spyOn(store, 'answerErrorPractice').mockImplementationOnce(async (...args) => {
      await original(...args)
      return { status: 'failed', error: 'quota exceeded' }
    })
    await choose(wrapper, 1)
    expect(wrapper.get('[role="alert"]').text()).toContain('quota exceeded')
    expect(wrapper.get('[role="alert"]').text()).toContain('остаётся в памяти')
    expect(store.state.remediationAttempts[0]?.answers).toHaveLength(1)
    wrapper.unmount()
  })
  it('offers no premature task while loading and handles empty history', async () => {
    const store = useWorkshopStore()
    store.ready = false
    store.state = emptyWorkshop()
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Загружаем')
    expect(wrapper.findAll('button')).toHaveLength(0)
    store.ready = true
    await flushPromises()
    expect(wrapper.text()).toContain('Пока нет результатов')
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(2)
    wrapper.unmount()
  })
  it('a late save cannot replace the new route notice or move it to another question', async () => {
    const store = useWorkshopStore()
    store.state.events.push({
      ...store.state.events[0]!,
      attemptId: '00000000-0000-4000-8000-000000000002',
      taskId: 'Q-2-3',
      module: 'question',
      errorIds: ['dns-context'],
    })
    const wrapper = panel()
    await flushPromises()
    await start(wrapper)
    let finish!: () => void
    const original = store.answerErrorPractice
    vi.spyOn(store, 'answerErrorPractice').mockImplementationOnce(async (...args) => {
      await original(...args)
      return new Promise((resolve) => {
        finish = () => resolve({ status: 'failed', error: 'late error' })
      })
    })
    await wrapper.findAll('.workshop-choices button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Результат в памяти вкладки')
    expect(wrapper.text()).toContain('Фиксируем текущий ответ')
    reactive(route).query.error = 'dns-context'
    await flushPromises()
    finish()
    await flushPromises()
    expect(wrapper.text()).toContain('Обоснованное изменение DNS')
    expect(wrapper.text()).not.toContain('late error')
    expect(wrapper.text()).not.toContain('2 из 2')
    wrapper.unmount()
  })
})
