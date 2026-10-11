import { computed, ref, watch } from 'vue'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { compareOutputs } from '../sessions/session'
import type { TerminalRecord } from './useTerminalStore'

export function terminalRecordKey(record: TerminalRecord) {
  return record.recordId ?? `sequence:${record.id}`
}

export function useTerminalComparison(records: () => TerminalRecord[]) {
  const beforeId = ref('')
  const afterId = ref('')
  // Parse once per history change, rather than again on every selector change.
  const entries = computed(() =>
    records().flatMap((record) => {
      if (!record.kind) return []
      const value = analyzeOutput(record.output, record.kind).parse.value
      return value ? [{ record, value, key: terminalRecordKey(record) }] : []
    }),
  )
  type Entry = (typeof entries.value)[number]
  const compatible = (a: Entry, b: Entry) =>
    a.value.kind === b.value.kind &&
    !(
      a.value.kind === 'powershell' &&
      b.value.kind === 'powershell' &&
      a.value.cmdlet !== b.value.cmdlet
    )
  const before = computed(() => entries.value.find((entry) => entry.key === beforeId.value))
  const after = computed(() => entries.value.find((entry) => entry.key === afterId.value))
  const afterOptions = computed(() =>
    entries.value.filter(
      (entry) =>
        !before.value ||
        (entry.record.id > before.value.record.id && compatible(before.value, entry)),
    ),
  )
  const suggested = computed(() => {
    for (const right of [...entries.value].reverse()) {
      const left = [...entries.value]
        .reverse()
        .find(
          (entry) =>
            entry.record.id < right.record.id &&
            entry.record.revision < right.record.revision &&
            entry.record.command.trim() === right.record.command.trim() &&
            compatible(entry, right),
        )
      if (left) return { left, right }
    }
    return undefined
  })
  const comparison = computed(() => {
    const left = before.value,
      right = after.value
    if (!left || !right) return { error: '', values: [], contextChanged: false }
    if (left.record.id >= right.record.id || !compatible(left, right))
      return {
        error: 'Выберите более позднюю проверку того же формата и cmdlet.',
        values: [],
        contextChanged: false,
      }
    return {
      error: '',
      values: compareOutputs(left.value, right.value),
      contextChanged: left.record.command.trim() !== right.record.command.trim(),
    }
  })
  watch(entries, () => {
    if (!before.value) beforeId.value = ''
    if (!after.value) afterId.value = ''
  })
  watch(
    beforeId,
    () => {
      if (!afterOptions.value.some((entry) => entry.key === afterId.value)) afterId.value = ''
    },
    { flush: 'sync' },
  )
  function selectSuggested() {
    const pair = suggested.value
    if (!pair) return
    beforeId.value = pair.left.key
    afterId.value = pair.right.key
  }
  return {
    beforeId,
    afterId,
    entries,
    before,
    after,
    afterOptions,
    comparison,
    suggested,
    selectSuggested,
  }
}
