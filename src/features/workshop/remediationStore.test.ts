import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkshopStore } from './useWorkshopStore'
import { learningEventSchema } from './skills'
import { workshopDb } from './storage'
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function storeWithError() {
  const store = useWorkshopStore()
  await store.initialize()
  store.ready = true
  vi.spyOn(store, 'initialize').mockResolvedValue()
  store.state = {
    ...store.state,
    events: [
      learningEventSchema.parse({
        attemptId: crypto.randomUUID(),
        module: 'course',
        taskId: 'DNS',
        skill: 'dns',
        at: new Date(Date.now() - 1000).toISOString(),
        score: 0,
        outcome: 'failed',
      }),
    ],
  }
  return store
}
describe('remediation writes', () => {
  it('uses the existing opt-in preference and rejects concurrent duplicate first answers', async () => {
    const store = await storeWithError()
    const transaction = vi.spyOn(workshopDb, 'transaction')
    const started = await store.startErrorPractice('dns-cache')
    expect(started.saved.status).toBe('memory')
    const results = await Promise.allSettled([
      store.answerErrorPractice(started.id, 0, 1),
      store.answerErrorPractice(started.id, 0, 0),
    ])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(store.state.remediationAttempts[0]?.answers[0]?.choice).toBe(1)
    await store.answerErrorPractice(started.id, 1, 2)
    expect(store.state.events).toHaveLength(2)
    expect(store.state.theoryChecks).toHaveLength(0)
    expect(store.state.attempts).toHaveLength(0)
    expect(transaction).not.toHaveBeenCalled()
    await expect(store.answerErrorPractice(started.id, 1, 2)).rejects.toThrow('зафиксирован')
  })
  it('retains progress and exposes failed persistence through the existing save result', async () => {
    const store = await storeWithError()
    store.enabled = true
    vi.stubGlobal('localStorage', { getItem: () => 'true' })
    vi.spyOn(workshopDb, 'transaction').mockRejectedValue(new Error('storage unavailable'))
    const started = await store.startErrorPractice('dns-cache')
    expect(started.saved).toEqual({ status: 'failed', error: 'storage unavailable' })
    const saved = await store.answerErrorPractice(started.id, 0, 1)
    expect(saved.status).toBe('failed')
    expect(store.state.remediationAttempts[0]?.answers).toHaveLength(1)
    expect(store.saving).toBe(false)
  })
})
