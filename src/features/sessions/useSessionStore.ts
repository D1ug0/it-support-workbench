import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { AnalysisResult } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { analyzeSession } from './session'
import type { SessionRecord } from './session'
import { restoreArchive, type SessionArchive } from './archive'
export const useSessionStore = defineStore('session', () => {
  const title = ref('')
  const context = ref('')
  const records = shallowRef<SessionRecord[]>([])
  const restored = ref(false)
  const active = computed(() => Boolean(context.value))
  const observations = computed(() => analyzeSession(records.value))
  function start(name: string, device: string, confirmed: boolean) {
    if (!confirmed || !device.trim())
      throw new Error('Укажите контекст устройства и подтвердите принадлежность проверок.')
    if (records.value.length) throw new Error('Сначала завершите или очистите текущую сессию.')
    restored.value = false
    title.value = name.trim().slice(0, 100) || 'Рабочая сессия'
    context.value = device.trim().slice(0, 100)
  }
  function add(
    analysis: AnalysisResult<ParsedOutput>,
    source: string,
    label: string,
    observedAt: string,
  ) {
    if (restored.value)
      throw new Error(
        'Архив открыт для просмотра. Очистите его и создайте новую сессию для измерений.',
      )
    if (!active.value || !analysis.parse.value)
      throw new Error('Сначала создайте сессию с подтверждённым контекстом.')
    if (!Number.isFinite(Date.parse(observedAt)))
      throw new Error('Укажите корректное время проверки.')
    if (records.value.length >= 20) throw new Error('В одной сессии допускается 20 проверок.')
    if (
      new TextEncoder().encode(source + records.value.map((r) => r.source).join('')).length >
      4 * 1024 * 1024
    )
      throw new Error('Общий объём источников сессии превышает 4 MiB.')
    records.value = [
      ...records.value,
      {
        id: globalThis.crypto.randomUUID(),
        label: label.trim().slice(0, 100) || analysis.parse.kind,
        observedAt: new Date(observedAt).toISOString(),
        analysis: structuredClone(analysis),
        source,
      },
    ]
  }
  function remove(id: string) {
    records.value = records.value.filter((r) => r.id !== id)
  }
  function clear() {
    restored.value = false
    records.value = []
    title.value = ''
    context.value = ''
  }
  function restore(value: SessionArchive) {
    records.value = restoreArchive(value)
    restored.value = true
    title.value = 'Обезличенный архив'
    context.value = 'Исходники и реальные имена исключены'
  }
  return {
    restored,
    restore,
    title,
    context,
    records,
    active,
    observations,
    start,
    add,
    remove,
    clear,
  }
})
