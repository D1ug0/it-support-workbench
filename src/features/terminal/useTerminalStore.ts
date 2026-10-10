import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { analyzeOutput } from '../network-analysis/application/analyzeOutput'
import { useLearningStore } from '../learning/useLearningStore'
import type { AnalysisResult, CommandKind } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { assessLab, createEnvironment, executeCommand } from './engine'
import { labIds, terminalLabs, type LabId } from './catalog'
import { checkpointSchema, type Checkpoint, type TerminalMode } from './checkpoint'
import { undoNetworkChange, type LabDefinition, type NetworkState } from './networkModel'
import { useWorkshopStore } from '../workshop/useWorkshopStore'
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
  const variantSeed = ref(0)
  const rollbackStates = shallowRef<NetworkState[]>([])
  const mode = ref<TerminalMode>('guided')
  const records = shallowRef<TerminalRecord[]>([])
  const diagnosis = ref<number>()
  const hints = ref(0)
  const finished = ref(false)
  const feedback = shallowRef<ReturnType<typeof assessLab>>()
  const analyzed = shallowRef<{ record: TerminalRecord; result: AnalysisResult<ParsedOutput> }>()
  const lab = computed(
    () =>
      environment.value.network?.definition ??
      terminalLabs.find((l) => l.id === environment.value.labId)!,
  )
  let sequence = 0
  function start(
    id: LabId,
    nextMode: TerminalMode = mode.value,
    definition?: LabDefinition,
    seed = 0,
  ) {
    variantSeed.value = Number.isInteger(seed) ? Math.max(0, Math.min(999999, seed)) : 0
    environment.value = createEnvironment(id, definition, variantSeed.value)
    mode.value = nextMode
    records.value = []
    rollbackStates.value = []
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
    if (environment.value.network && result.state.revision > environment.value.revision)
      rollbackStates.value = [
        ...rollbackStates.value,
        structuredClone(environment.value.network),
      ].slice(-20)
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
  function undo() {
    const previous = rollbackStates.value.at(-1),
      current = environment.value.network
    if (!previous || !current || finished.value) return false
    const restored = undoNetworkChange(current, previous)
    environment.value = {
      ...environment.value,
      network: restored,
      dns: restored.dns,
      cache: restored.cache?.address ?? null,
      revision: restored.revision,
      verifiedRevision: null,
    }
    rollbackStates.value = rollbackStates.value.slice(0, -1)
    feedback.value = undefined
    analyzed.value = undefined
    return true
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
      await useWorkshopStore().record({
        id: environment.value.labId,
        skill:
          environment.value.network?.definition.skill ??
          (environment.value.labId === 'TERM-ICMP-TCP' ? 'transport' : 'dns'),
        mode: mode.value,
        score: feedback.value.score,
        hints: hints.value,
        complete: feedback.value.complete,
        at: new Date().toISOString(),
        seed: variantSeed.value,
        variantKey: environment.value.network
          ? `${environment.value.network.definition.client}/${environment.value.network.definition.prefix}:${environment.value.network.definition.server}:${environment.value.network.definition.target}:${environment.value.network.definition.fault}`
          : 'base',
      })
      if (mode.value !== 'practice')
        await useLearningStore().complete(environment.value.labId, feedback.value.score)
    }
  }
  function checkpoint(): Checkpoint {
    return checkpointSchema.parse({
      schemaVersion: 2,
      variantSeed: variantSeed.value,
      environment: environment.value,
      mode: mode.value,
      hints: hints.value,
      diagnosis: diagnosis.value ?? null,
      finished: finished.value,
    })
  }
  function restore(value: Checkpoint) {
    const valid = checkpointSchema.parse(value)
    start(
      valid.environment.labId,
      valid.mode,
      'network' in valid.environment ? valid.environment.network?.definition : undefined,
      'variantSeed' in valid ? (valid.variantSeed ?? 0) : 0,
    )
    environment.value = valid.environment
    hints.value = valid.hints
    diagnosis.value = valid.diagnosis ?? undefined
    finished.value = valid.finished
    if (valid.finished) feedback.value = assessLab(valid.environment, diagnosis.value, valid.hints)
  }
  return {
    environment,
    variantSeed,
    rollbackStates,
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
    undo,
    analyze,
    finish,
    checkpoint,
    restore,
  }
})
