// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import AnalyzerInput from './AnalyzerInput.vue'
import { useAnalysisStore } from '../model/useAnalysisStore'
import { readTextFile } from '../../../infrastructure/files/readTextFile'

vi.mock('../../../infrastructure/files/readTextFile', () => ({ readTextFile: vi.fn() }))

function pendingRead() {
  let finish!: (text: string) => void
  const promise = new Promise<string>((resolve) => (finish = resolve))
  vi.mocked(readTextFile).mockReturnValueOnce(promise)
  return finish
}
function setup() {
  const pinia = createPinia()
  const wrapper = mount(AnalyzerInput, { global: { plugins: [pinia] } })
  const store = useAnalysisStore(pinia)
  return { wrapper, store }
}
async function openFile(wrapper: ReturnType<typeof setup>['wrapper']) {
  await wrapper.get('#tab-file').trigger('click')
  const input = wrapper.get<HTMLInputElement>('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: [new File(['demo'], 'demo.txt')] })
  await input.trigger('change')
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())
describe('pending local file reads', () => {
  it('does not restore cleared data when a file finishes reading later', async () => {
    const finish = pendingRead()
    const { wrapper, store } = setup()
    await openFile(wrapper)
    await wrapper.get('.input-actions .ghost').trigger('click')
    finish('Old file content')
    await flushPromises()
    expect(store.input).toBe('')
    expect(wrapper.text()).not.toContain('Чтение локального файла')
    wrapper.unmount()
  })
  it('keeps new pasted text when an older file read completes', async () => {
    const finish = pendingRead()
    const { wrapper, store } = setup()
    await openFile(wrapper)
    await wrapper.get('#tab-text').trigger('click')
    await wrapper.get('textarea').setValue('New pasted text')
    finish('Old file content')
    await flushPromises()
    expect(store.input).toBe('New pasted text')
    wrapper.unmount()
  })
  it('discards a pending read after leaving the analyzer', async () => {
    const finish = pendingRead()
    const { wrapper, store } = setup()
    await openFile(wrapper)
    wrapper.unmount()
    store.setInput('New session')
    finish('Old file content')
    await flushPromises()
    expect(store.input).toBe('New session')
  })
})
