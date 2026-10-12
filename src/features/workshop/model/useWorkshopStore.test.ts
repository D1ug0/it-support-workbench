import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createWorkshopStore } from './useWorkshopStore'
import type { WorkshopProgress } from '../domain/skills'
import type { WorkshopRepository, WorkshopSnapshot } from '../application/workshopRepository'

function repository() {
  const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value })
  return {
    read: vi.fn(async (): Promise<WorkshopSnapshot> => [
      fulfilled(undefined),
      fulfilled([]),
      fulfilled([]),
      fulfilled([]),
      fulfilled([]),
    ]),
    saveProgress: vi.fn(async (_snapshot: WorkshopProgress, revision: number) => revision + 1),
    disableProgress: vi.fn(async () => undefined),
    clearProgress: vi.fn(async () => {}),
    readMaterials: vi.fn(async () => []),
    saveMaterials: vi.fn(async () => ({})),
    deleteMaterial: vi.fn(async () => {}),
    saveReport: vi.fn(async (value) => value),
    removeReport: vi.fn(async () => {}),
  } satisfies WorkshopRepository
}
const event = (id: string) => ({
  attemptId: id,
  module: 'course',
  taskId: 'DNS',
  skill: 'dns',
  at: '2026-10-12T10:00:00Z',
  score: 100,
  outcome: 'completed',
})
beforeEach(() => setActivePinia(createPinia()))

describe('store through an injected persistence port', () => {
  it('keeps learning in RAM until explicit consent, without writing to its repository', async () => {
    const port = repository(),
      store = createWorkshopStore(port)()
    expect(await store.recordResult({ event: event(crypto.randomUUID()) })).toEqual({
      status: 'memory',
    })
    expect(store.state.events).toHaveLength(1)
    expect(port.saveProgress).not.toHaveBeenCalled()
    expect(port.read).toHaveBeenCalledTimes(1)
  })
  it('serializes detached snapshots and advances CAS revision only after a successful write', async () => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.enabled = true
    let commit!: (revision: number) => void
    port.saveProgress.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          commit = resolve
        }),
    )
    const first = store.recordResult({ event: event(crypto.randomUUID()) })
    const second = store.recordResult({ event: event(crypto.randomUUID()) })
    await vi.waitFor(() => expect(port.saveProgress).toHaveBeenCalledTimes(1))
    expect(store.saving).toBe(true)
    expect(store.state.events).toHaveLength(2)
    expect(port.saveProgress.mock.calls[0]![0].events).toHaveLength(1)
    commit(1)
    expect(await Promise.all([first, second])).toEqual([{ status: 'saved' }, { status: 'saved' }])
    expect(port.saveProgress.mock.calls.map((call) => call[1])).toEqual([0, 1])
    expect(port.saveProgress.mock.calls[1]![0].events).toHaveLength(2)
    expect(store.saving).toBe(false)
  })
  it('preserves the RAM result and expected revision when the durable write fails', async () => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.enabled = true
    port.saveProgress.mockRejectedValueOnce(new Error('CAS conflict'))
    expect(await store.recordResult({ event: event(crypto.randomUUID()) })).toEqual({
      status: 'failed',
      error: 'CAS conflict',
    })
    expect(store.state.events).toHaveLength(1)
    expect(await store.recordResult({ event: event(crypto.randomUUID()) })).toEqual({
      status: 'saved',
    })
    expect(port.saveProgress.mock.calls.map((call) => call[1])).toEqual([0, 0])
  })
})
