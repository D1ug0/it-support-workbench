import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { useLearningStore } from './useLearningStore'
import { emptyProgress, recordAnswer } from './progress'
import { writeProgress } from './repository'
vi.mock('./repository', () => ({
  readProgress: vi.fn(async () => undefined),
  writeProgress: vi.fn(async () => 1),
  deleteProgress: vi.fn(async () => undefined),
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
describe('learning import and opt-in', () => {
  it('imports a reactive preview as independent plain data without writing by default', async () => {
    const store = useLearningStore()
    const preview = reactive(
      recordAnswer(emptyProgress(), 'q', true, Date.parse('2026-10-10T00:00:00Z')),
    )
    await store.replace(preview)
    expect(store.state).toEqual(preview)
    preview.answers.q!.attempts = 10
    expect(store.state.answers.q?.attempts).toBe(1)
    expect(writeProgress).not.toHaveBeenCalled()
  })
  it('persists only after enabling and stops subsequent answers after disabling', async () => {
    const store = useLearningStore()
    await store.answer('q', true)
    expect(writeProgress).not.toHaveBeenCalled()
    await store.setEnabled(true)
    await store.answer('q', false)
    expect(writeProgress).toHaveBeenLastCalledWith(true, store.state, expect.any(Number))
    await store.setEnabled(false)
    vi.mocked(writeProgress).mockClear()
    await store.answer('q', true)
    expect(writeProgress).not.toHaveBeenCalled()
  })
  it('keeps saving visible until every queued snapshot is written', async () => {
    const store = useLearningStore()
    await store.setEnabled(true)
    vi.mocked(writeProgress).mockClear()
    let finishFirst!: () => void
    let finishSecond!: () => void
    const firstWrite = new Promise<number>((resolve) => (finishFirst = () => resolve(2)))
    const secondWrite = new Promise<number>((resolve) => (finishSecond = () => resolve(3)))
    vi.mocked(writeProgress)
      .mockImplementationOnce(() => firstWrite)
      .mockImplementationOnce(() => secondWrite)
    const first = store.answer('q', false)
    await vi.waitFor(() => expect(writeProgress).toHaveBeenCalledTimes(1))
    const second = store.answer('q', true)
    await vi.waitFor(() => expect(store.state.answers.q?.attempts).toBe(2))
    expect(store.saving).toBe(true)
    finishFirst()
    await first
    await vi.waitFor(() => expect(writeProgress).toHaveBeenCalledTimes(2))
    expect(store.saving).toBe(true)
    expect(vi.mocked(writeProgress).mock.calls[0]![1].answers.q?.lastCorrect).toBe(false)
    expect(vi.mocked(writeProgress).mock.calls[1]![1].answers.q?.lastCorrect).toBe(true)
    finishSecond()
    await second
    expect(store.saving).toBe(false)
  })
})
