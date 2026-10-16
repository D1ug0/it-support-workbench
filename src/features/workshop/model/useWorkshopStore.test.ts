import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createWorkshopStore } from './useWorkshopStore'
import type { WorkshopProgress } from '../domain/skills'
import type { WorkshopRepository, WorkshopSnapshot } from '../application/workshopRepository'
import { extendedLabs } from '../../terminal/labDefinitions'
import { sampleGraph } from '../domain/graph'
import { customCourseSchema } from '../domain/customCourses'
import { workshopCourses } from '../domain/courses'

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
    disableProgress: vi.fn<WorkshopRepository['disableProgress']>(async () => undefined),
    clearProgress: vi.fn(async () => {}),
    readMaterials: vi.fn<WorkshopRepository['readMaterials']>(async () => []),
    saveMaterials: vi.fn<WorkshopRepository['saveMaterials']>(async () => ({})),
    deleteMaterial: vi.fn<WorkshopRepository['deleteMaterial']>(async () => {}),
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

const lab = { ...extendedLabs[0]!, id: 'USR-00000000-0000-4000-8000-000000000005' }
const course = customCourseSchema.parse({
  ...workshopCourses[0],
  schemaVersion: 1,
  id: 'COURSE-' + 'A'.repeat(32),
  labs: [],
})
const materialCases = [
  { collection: 'labs', value: lab, save: 'saveLabs', remove: 'removeLab' },
  { collection: 'courses', value: course, save: 'saveCourses', remove: 'removeCourse' },
  { collection: 'graphs', value: sampleGraph, save: 'saveGraph', remove: 'removeGraph' },
] as const

describe('material deletion tokens', () => {
  it.each(materialCases)('allows reimport after deleting $collection', async (entry) => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.materialTokens[entry.collection] = { [entry.value.id]: 'previous-token' }
    await store[entry.remove](entry.value.id)
    if (entry.save === 'saveGraph') await store.saveGraph(entry.value)
    else if (entry.save === 'saveLabs') await store.saveLabs([entry.value])
    else await store.saveCourses([entry.value])
    expect(port.deleteMaterial).toHaveBeenCalledWith(
      entry.collection,
      entry.value.id,
      'previous-token',
    )
    expect(port.saveMaterials).toHaveBeenCalledWith(entry.collection, [entry.value], {
      [entry.value.id]: null,
    })
  })
  it.each(materialCases)('preserves the token when deleting $collection fails', async (entry) => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.materialTokens[entry.collection] = { [entry.value.id]: 'previous-token' }
    port.deleteMaterial.mockRejectedValueOnce(new Error('CAS conflict'))
    await expect(store[entry.remove](entry.value.id)).rejects.toThrow('CAS conflict')
    expect(store.tokensFor(entry.collection, [entry.value.id])).toEqual({
      [entry.value.id]: 'previous-token',
    })
  })
})
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

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
  it('discards queued snapshots after consent is revoked, even when saving is enabled again', async () => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.enabled = true
    let commit!: (revision: number) => void
    port.saveProgress.mockImplementationOnce(
      () => new Promise<number>((resolve) => (commit = resolve)),
    )
    port.disableProgress.mockResolvedValueOnce(2)
    const first = store.recordResult({ event: event(crypto.randomUUID()) })
    const second = store.recordResult({ event: event(crypto.randomUUID()) })
    await vi.waitFor(() => expect(port.saveProgress).toHaveBeenCalledTimes(1))
    const disabling = store.toggle(false)
    await vi.waitFor(() => expect(store.enabled).toBe(false))
    const enabling = store.toggle(true)
    await vi.waitFor(() => expect(store.enabled).toBe(true))
    commit(1)
    expect(await first).toEqual({ status: 'saved' })
    expect(await second).toEqual({ status: 'memory' })
    await Promise.all([disabling, enabling])
    expect(port.saveProgress.mock.calls.map((call) => call[1])).toEqual([0, 2])
    expect(port.saveProgress.mock.calls[1]![0].events).toHaveLength(2)
    expect(store.state.events).toHaveLength(2)
    expect(store.saving).toBe(false)
  })
  it('checks an opt-out from another tab before starting a queued write', async () => {
    const port = repository(),
      store = createWorkshopStore(port)()
    await store.initialize()
    store.enabled = true
    let commit!: (revision: number) => void
    port.saveProgress.mockImplementationOnce(
      () => new Promise<number>((resolve) => (commit = resolve)),
    )
    const first = store.recordResult({ event: event(crypto.randomUUID()) })
    const second = store.recordResult({ event: event(crypto.randomUUID()) })
    await vi.waitFor(() => expect(port.saveProgress).toHaveBeenCalledTimes(1))
    vi.stubGlobal('localStorage', { getItem: () => 'false' })
    commit(1)
    expect(await first).toEqual({ status: 'saved' })
    expect(await second).toEqual({ status: 'memory' })
    expect(port.saveProgress).toHaveBeenCalledTimes(1)
    expect(store.enabled).toBe(false)
    expect(store.saving).toBe(false)
    expect(store.state.events).toHaveLength(2)
  })
})
