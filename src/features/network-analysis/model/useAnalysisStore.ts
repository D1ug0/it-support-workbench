import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { AnalysisResult, EvidenceRange, CommandKind } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
import { normalizeInput } from '../../../domain/diagnostics/parsers/normalizeInput'

export const useAnalysisStore = defineStore('analysis', () => {
  const input = ref('')
  const mode = ref<'auto' | CommandKind>('auto')
  const result = shallowRef<AnalysisResult<ParsedOutput>>()
  const busy = ref(false)
  const error = ref('')
  const selectedRange = ref<EvidenceRange>()
  const revealed = ref(false)
  const source = ref('Вставленный текст')
  const generation = ref(0)
  let worker: Worker | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    worker?.terminate()
    worker = undefined
    clearTimeout(timeout)
    timeout = undefined
    busy.value = false
  }
  function setInput(text: string, label = 'Вставленный текст') {
    cancel()
    input.value = normalizeInput(text)
    result.value = undefined
    selectedRange.value = undefined
    source.value = label
    error.value = ''
  }
  function clear() {
    setInput('')
    mode.value = 'auto'
    revealed.value = false
    generation.value++
  }
  function analyze() {
    cancel()
    error.value = ''
    selectedRange.value = undefined
    result.value = undefined
    busy.value = true
    let current: Worker
    try {
      current = new Worker(new URL('../infrastructure/analysis.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      error.value = 'Браузер не смог запустить Worker. Проверьте ограничения браузера.'
      cancel()
      return
    }
    worker = current
    current.onmessage = (event: MessageEvent<AnalysisResult<ParsedOutput>>) => {
      if (worker !== current) return
      result.value = event.data
      cancel()
    }
    current.onerror = () => {
      if (worker !== current) return
      error.value = 'Не удалось обработать текст. Попробуйте повторить анализ.'
      cancel()
    }
    timeout = setTimeout(() => {
      error.value = 'Обработка заняла слишком много времени. Уменьшите объём вывода.'
      cancel()
    }, 15_000)
    current.postMessage({ text: input.value, mode: mode.value })
  }
  return {
    input,
    mode,
    result,
    busy,
    error,
    selectedRange,
    revealed,
    source,
    generation,
    setInput,
    clear,
    analyze,
  }
})
