// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CopyCommand from './CopyCommand.vue'

const writeText = vi.fn<(command: string) => Promise<void>>()
const wrappers: ReturnType<typeof mount>[] = []
function setup() {
  const wrapper = mount(CopyCommand, { props: { command: 'ipconfig /all' } })
  wrappers.push(wrapper)
  return wrapper
}
function pendingCopy() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  writeText.mockReturnValueOnce(
    new Promise<void>((ok, fail) => {
      resolve = ok
      reject = fail
    }),
  )
  return { resolve, reject: () => reject(new Error('Clipboard denied')) }
}

beforeEach(() => {
  vi.useFakeTimers()
  writeText.mockReset()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('clipboard feedback lifecycle', () => {
  it('copies the exact command and announces success for the full feedback interval', async () => {
    writeText.mockResolvedValueOnce()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('ipconfig /all')
    expect(wrapper.get('[role=status]').text()).toBe('Команда скопирована в буфер обмена.')
    await vi.advanceTimersByTimeAsync(1799)
    expect(wrapper.get('button').text()).toBe('Скопировано')
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('[role=status]').text()).toBe('')
  })

  it('keeps the latest failure when an older copy succeeds afterward', async () => {
    const old = pendingCopy()
    const latest = pendingCopy()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    latest.reject()
    await flushPromises()
    old.resolve()
    await flushPromises()
    expect(wrapper.get('[role=status]').text()).toContain('Не удалось скопировать')
    expect(wrapper.get('button').text()).toBe('Копировать')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the latest success when an older copy fails afterward', async () => {
    const old = pendingCopy()
    const latest = pendingCopy()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    latest.resolve()
    await flushPromises()
    old.reject()
    await flushPromises()
    expect(wrapper.get('[role=status]').text()).toBe('Команда скопирована в буфер обмена.')
    expect(wrapper.get('button').text()).toBe('Скопировано')
  })

  it('does not restart the latest feedback timer when an older copy finishes', async () => {
    const old = pendingCopy()
    const latest = pendingCopy()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    latest.resolve()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1700)
    old.resolve()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.get('[role=status]').text()).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['resolve', 'reject'] as const)(
    'discards a pending %s after the command changes',
    async (finish) => {
      const old = pendingCopy()
      const wrapper = setup()
      await wrapper.get('button').trigger('click')
      await wrapper.setProps({ command: 'route print' })
      old[finish]()
      await flushPromises()
      expect(wrapper.get('[role=status]').text()).toBe('')
      expect(wrapper.get('code').text()).toBe('route print')
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('clears completed feedback when the displayed command changes', async () => {
    writeText.mockResolvedValueOnce()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.setProps({ command: 'Test-NetConnection example.com -Port 443' })
    expect(wrapper.get('[role=status]').text()).toBe('')
    expect(wrapper.get('.command-shell').text()).toBe('PowerShell')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not schedule feedback after unmounting during a pending copy', async () => {
    const pending = pendingCopy()
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    wrapper.unmount()
    pending.resolve()
    await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows manual-copy guidance when the clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = setup()
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[role=status]').text()).toContain('Выделите команду вручную')
  })
})
