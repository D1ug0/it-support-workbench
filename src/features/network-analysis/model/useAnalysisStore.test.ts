import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAnalysisStore } from './useAnalysisStore'
import { analyzeOutput } from '../application/analyzeOutput'
import { examples } from '../../../fixtures'
import type { AnalysisResult } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
const workers: FakeWorker[] = []
class FakeWorker {
  onmessage: ((event: MessageEvent<AnalysisResult<ParsedOutput>>) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  constructor() {
    workers.push(this)
  }
  terminate() {
    this.terminated = true
  }
  postMessage = vi.fn()
}
beforeEach(() => {
  workers.length = 0
  setActivePinia(createPinia())
  vi.stubGlobal('Worker', FakeWorker)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('worker lifecycle', () => {
  it('ignores late responses and errors from a cancelled worker', () => {
    const store = useAnalysisStore()
    store.setInput(examples[0]!.text)
    store.analyze()
    const old = workers[0]!
    store.setInput(examples[1]!.text)
    store.analyze()
    old.onmessage?.(new MessageEvent('message', { data: analyzeOutput(examples[0]!.text) }))
    old.onerror?.()
    expect(store.result).toBeUndefined()
    expect(store.busy).toBe(true)
    expect(store.error).toBe('')
    workers[1]!.onmessage?.(new MessageEvent('message', { data: analyzeOutput(examples[1]!.text) }))
    expect(store.result?.parse.status).toBe('ok')
    expect(store.busy).toBe(false)
    vi.advanceTimersByTime(15_000)
    expect(store.error).toBe('')
  })
  it('handles timeouts and a constructor blocked by the browser', () => {
    const store = useAnalysisStore()
    store.analyze()
    vi.advanceTimersByTime(15_000)
    expect(store.error).toContain('слишком много')
    expect(workers[0]?.terminated).toBe(true)
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked')
        }
      },
    )
    store.analyze()
    expect(store.error).toContain('Worker')
    expect(store.busy).toBe(false)
  })
})
