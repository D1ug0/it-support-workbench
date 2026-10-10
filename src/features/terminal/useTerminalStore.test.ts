import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTerminalStore } from './useTerminalStore'
import { useLearningStore } from '../learning/useLearningStore'
import { labIds } from './catalog'
import { HOST } from './engine'
import { parseProgress } from '../learning/progress'
vi.mock('../learning/repository', () => ({
  readProgress: vi.fn(async () => undefined),
  writeProgress: vi.fn(),
  deleteProgress: vi.fn(),
}))
beforeEach(() => setActivePinia(createPinia()))
function solve() {
  const store = useTerminalStore()
  store.run(`ping ${HOST}`)
  store.run(`Test-NetConnection ${HOST} -Port 443`)
  store.diagnosis = 2
}
it('records one completed learning attempt and accepts its exported IDs', async () => {
  const store = useTerminalStore(),
    learning = useLearningStore()
  store.start(labIds[2])
  solve()
  await store.finish()
  await store.finish()
  expect(learning.state.scenarios[labIds[2]]?.attempts).toBe(1)
  expect(learning.state.journal.at(-1)?.taskId).toBe(labIds[2])
  expect(parseProgress(JSON.stringify(learning.state), [], [...labIds])).toEqual(learning.state)
  expect(store.run('ipconfig')).toBeUndefined()
})
it('allows another check after incomplete guided attempt; independent practice skips journal', async () => {
  const store = useTerminalStore()
  store.start(labIds[2], 'practice')
  store.diagnosis = 2
  await store.finish()
  expect(store.finished).toBe(false)
  solve()
  await store.finish()
  expect(store.finished).toBe(true)
  expect(useLearningStore().state.journal).toEqual([])
})
it('finalizes an exam once even with incomplete evidence', async () => {
  const store = useTerminalStore()
  store.start(labIds[2], 'exam')
  store.diagnosis = 0
  await store.finish()
  expect(store.finished).toBe(true)
  expect(store.feedback?.complete).toBe(false)
  expect(useLearningStore().state.journal).toHaveLength(1)
})
it('restores a checkpoint without replaying commands or awarding progress', async () => {
  const store = useTerminalStore()
  store.start(labIds[2])
  solve()
  await store.finish()
  const checkpoint = store.checkpoint()
  store.start(labIds[0])
  store.run('help PRIVATE-MARKER')
  store.restore(checkpoint)
  expect(store.records).toEqual([])
  expect(store.finished).toBe(true)
  await store.finish()
  expect(useLearningStore().state.journal).toHaveLength(1)
  expect(JSON.stringify(checkpoint)).not.toContain('PRIVATE-MARKER')
})
it('bounds transcript records and keeps only an explicitly selected analysis', () => {
  const store = useTerminalStore()
  for (let i = 0; i < 45; i++) store.run('ipconfig /all')
  expect(store.records).toHaveLength(40)
  expect(store.analyzed).toBeUndefined()
  store.analyze(store.records[0]!.id)
  expect(store.analyzed?.result.parse.value?.kind).toBe('ipconfig')
  store.start(labIds[1])
  expect(store.analyzed).toBeUndefined()
})
