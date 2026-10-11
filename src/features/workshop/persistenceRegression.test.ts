import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkshopStore } from './useWorkshopStore'
import { saveMaterials, deleteMaterial } from './materialsRepository'
import { extendedLabs } from '../terminal/labDefinitions'
import { reportSchema } from './portfolio'
const storage = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string }
  const names = [
    'settings',
    'labs',
    'graphs',
    'reports',
    'courses',
    'baseProgress',
    'standAttempts',
    'scenarios',
    'drafts',
    'metadata',
    'professionalAttempts',
  ]
  const data = new Map<string, Map<string, Row>>()
  const rows = (name: string) => {
    if (!data.has(name)) data.set(name, new Map())
    return data.get(name)!
  }
  const table = (name: string) => ({
    get: async (id: string) => structuredClone(rows(name).get(id)),
    put: async (value: Row) => {
      rows(name).set(value.id, structuredClone(value))
    },
    delete: async (id: string) => {
      rows(name).delete(id)
    },
    count: async () => rows(name).size,
    toArray: async () => [...rows(name).values()].map((row) => structuredClone(row)),
    toCollection: () => ({ primaryKeys: async () => [...rows(name).keys()] }),
  })
  let queue = Promise.resolve<unknown>(undefined)
  const transaction = vi.fn((_mode: string, _tables: unknown, callback: () => Promise<unknown>) => {
    const operation = queue.then(async () => {
      const before = structuredClone(data)
      try {
        return await callback()
      } catch (error) {
        data.clear()
        before.forEach((rows, name) => data.set(name, rows))
        throw error
      }
    })
    queue = operation.catch(() => {})
    return operation
  })
  return { data, rows, table, transaction, budget: vi.fn(async () => {}), names }
})
vi.mock('./storage', () => ({
  workshopDb: { table: storage.table, transaction: storage.transaction },
  learningTables: () => storage.names.map(storage.table),
  assertStorageBudget: storage.budget,
}))
beforeEach(() => {
  storage.data.clear()
  vi.clearAllMocks()
  setActivePinia(createPinia())
})
const at = '2026-10-11T10:00:00Z'
describe('result persistence', () => {
  it('theory, assessment and journal commit once; replay does not duplicate evidence', async () => {
    const store = useWorkshopStore()
    await store.initialize()
    store.enabled = true
    const result = {
      theory: { taskId: 'DNS', skill: 'dns', form: 'choice', correct: true, at },
      assessment: true,
      event: {
        attemptId: crypto.randomUUID(),
        module: 'course',
        taskId: 'DNS',
        skill: 'dns',
        at,
        score: 100,
        outcome: 'completed',
      },
    }
    expect(await store.recordResult(result)).toEqual({ status: 'saved' })
    expect(storage.transaction).toHaveBeenCalledTimes(1)
    expect(storage.budget).toHaveBeenCalledTimes(1)
    expect(storage.transaction.mock.calls[0]![0]).toBe('rw')
    expect(storage.transaction.mock.calls[0]![1] as unknown[]).toHaveLength(11)
    expect(store.state).toMatchObject({
      assessment: { dns: true },
      theoryChecks: [{ taskId: 'DNS' }],
      events: [{ taskId: 'DNS' }],
    })
    await store.recordResult(result)
    expect(store.state.events).toHaveLength(1)
    expect(store.state.theoryChecks).toHaveLength(1)
    await store.markRead('DNS')
    expect(store.state.read).toEqual(['LESSON-DNS'])
  })
  it('invalid attribution is rejected before writing; a failed write keeps a retryable memory snapshot', async () => {
    const store = useWorkshopStore()
    await store.initialize()
    store.enabled = true
    const result = {
      theory: { taskId: 'ADDRESS', skill: 'addressing', form: 'choice', correct: true, at },
      event: {
        attemptId: crypto.randomUUID(),
        module: 'course',
        taskId: 'DNS',
        skill: 'dns',
        at,
        score: 100,
        outcome: 'completed',
      },
    }
    await expect(store.recordResult(result)).rejects.toThrow('одному заданию')
    expect(storage.transaction).not.toHaveBeenCalled()
    storage.budget.mockRejectedValueOnce(new Error('disk quota'))
    const valid = { ...result, theory: undefined }
    expect(await store.recordResult(valid)).toEqual({ status: 'failed', error: 'disk quota' })
    expect(storage.rows('settings').size).toBe(0)
    expect(store.state.events).toHaveLength(1)
    expect(await store.recordResult(valid)).toEqual({ status: 'saved' })
    expect(store.state.events).toHaveLength(1)
  })
})
describe('author content concurrency', () => {
  const lab = { ...extendedLabs[0]!, id: 'USR-one' }
  it('two writers sharing a token cannot overwrite each other; restore and deletion invalidate editors', async () => {
    const first = await saveMaterials('labs', [lab], {})
    const outcomes = await Promise.allSettled([
      saveMaterials('labs', [{ ...lab, title: 'first writer' }], first),
      saveMaterials('labs', [{ ...lab, title: 'stale writer' }], first),
    ])
    expect(outcomes.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(storage.rows('labs').get(lab.id)?.value).toMatchObject({ title: 'first writer' })
    await expect(deleteMaterial('labs', lab.id, first[lab.id]!)).rejects.toThrow('другой вкладке')
    const fresh = (outcomes[0] as PromiseFulfilledResult<Record<string, string | null>>).value
    storage.rows('labs').get(lab.id)!.storageToken = crypto.randomUUID()
    await expect(saveMaterials('labs', [lab], fresh)).rejects.toThrow('восстановлена')
    storage.rows('labs').delete(lab.id)
    await expect(saveMaterials('labs', [lab], fresh)).rejects.toThrow('удалена')
    expect(storage.rows('labs').size).toBe(0)
  })
  it('rolls back an entire import if its later material conflicts or exceeds storage budget', async () => {
    const two = { ...lab, id: 'USR-two' },
      three = { ...lab, id: 'USR-three' }
    await saveMaterials('labs', [two], {})
    await expect(saveMaterials('labs', [three, two], {})).rejects.toThrow('другой вкладке')
    expect(storage.rows('labs').has(three.id)).toBe(false)
    storage.budget.mockRejectedValueOnce(new Error('budget'))
    await expect(saveMaterials('labs', [three], {})).rejects.toThrow('budget')
    expect(storage.rows('labs').has(three.id)).toBe(false)
  })
  it('accepts a legacy envelope once and does not replace the content with storage metadata', async () => {
    storage.rows('labs').set(lab.id, { id: lab.id, value: lab })
    const tokens = await saveMaterials('labs', [{ ...lab, title: 'updated legacy' }], {
      [lab.id]: null,
    })
    expect(tokens[lab.id]).toEqual(expect.any(String))
    expect(storage.rows('labs').get(lab.id)?.value).not.toHaveProperty('storageToken')
  })
  it('portfolio report tokens also reject deletion and restore even if numeric versions repeat', async () => {
    const store = useWorkshopStore()
    const report = reportSchema.parse({
      id: crypto.randomUUID(),
      title: 'Original lab',
      labId: 'USR-deleted',
      at,
      symptom: '',
      hypothesis: '',
      evidence: '',
      change: '',
      verification: '',
      score: null,
    })
    const saved = await store.saveReport(report)
    storage.rows('reports').get(report.id)!.storageToken = crypto.randomUUID()
    await expect(store.saveReport({ ...saved, version: saved.version + 1 })).rejects.toThrow(
      'восстановлена',
    )
    storage.rows('reports').delete(report.id)
    await expect(store.saveReport({ ...saved, version: saved.version + 1 })).rejects.toThrow(
      'удалена',
    )
  })
})
