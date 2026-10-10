import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { useLearningStore } from '../learning/useLearningStore'
import type { AnalysisResult, CommandKind } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { assessLab, createEnvironment, executeCommand } from './engine'
import { labIds, terminalLabs, type LabId } from './catalog'
import { checkpointSchema, type Checkpoint, type TerminalMode } from './checkpoint'
export interface TerminalRecord {
  id: number
  command: string
  output: string
  kind?: CommandKind
  ok: boolean
  revision: number
}
export const useTerminalStore = defineStore('terminal-labs', () => {
  const environment = shallowRef(createEnvironment(labIds[0]))
  const mode = ref<TerminalMode>('guided')
  const records = shallowRef<TerminalRecord[]>([])
  const diagnosis = ref<number>()
  const hints = ref(0)
  const finished = ref(false)
  const feedback = shallowRef<ReturnType<typeof assessLab>>()
  const analyzed = shallowRef<{ record: TerminalRecord; result: AnalysisResult<ParsedOutput> }>()
  const lab = computed(() => terminalLabs.find((l) => l.id === environment.value.labId)!)
  let sequence = 0
  function start(id: LabId, nextMode: TerminalMode = mode.value) {
    environment.value = createEnvironment(id)
    mode.value = nextMode
    records.value = []
    diagnosis.value = undefined
    hints.value = 0
    finished.value = false
    feedback.value = undefined
    analyzed.value = undefined
    sequence = 0
  }
  function run(command: string) {
    if (finished.value || !command.trim()) return
    const result = executeCommand(environment.value, command)
    environment.value = result.state
    const record: TerminalRecord = {
      id: ++sequence,
      command: command.slice(0, 512),
      output: result.output,
      kind: result.kind,
      ok: result.ok,
      revision: result.state.revision,
    }
    records.value = [...records.value, record].slice(-40)
    feedback.value = undefined
    return { record, clear: result.clear }
  }
  function analyze(id: number) {
    const record = records.value.find((r) => r.id === id)
    if (record?.kind) analyzed.value = { record, result: analyzeOutput(record.output, record.kind) }
  }
  async function finish() {
    if (finished.value) return
    feedback.value = assessLab(environment.value, diagnosis.value, hints.value)
    if (feedback.value.complete || mode.value === 'exam') {
      finished.value = true
      if (mode.value !== 'practice')
        await useLearningStore().complete(environment.value.labId, feedback.value.score)
    }
  }
  function checkpoint(): Checkpoint {
    return checkpointSchema.parse({
      schemaVersion: 1,
      environment: environment.value,
      mode: mode.value,
      hints: hints.value,
      diagnosis: diagnosis.value ?? null,
      finished: finished.value,
    })
  }
  function restore(value: Checkpoint) {
    const valid = checkpointSchema.parse(value)
    start(valid.environment.labId, valid.mode)
    environment.value = valid.environment
    hints.value = valid.hints
    diagnosis.value = valid.diagnosis ?? undefined
    finished.value = valid.finished
    if (valid.finished) feedback.value = assessLab(valid.environment, diagnosis.value, valid.hints)
  }
  return {
    environment,
    mode,
    records,
    diagnosis,
    hints,
    finished,
    feedback,
    analyzed,
    lab,
    start,
    run,
    analyze,
    finish,
    checkpoint,
    restore,
  }
})
