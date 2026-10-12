import type { SaveResult } from '../../shared/persistence'
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
import { learningPolicy } from '../workshop/index'
import { causeForLab } from './labIdentity'
import { useWorkshopStore } from '../workshop/model/index'
import { reviewCommand, type CommandReview } from './review'
export interface TerminalRecord {
  id: number
  recordId?: string
  command: string
  output: string
  kind?: CommandKind
  ok: boolean
  revision: number
  changed?: boolean
  observation?: boolean
  review?: CommandReview
}
export const useTerminalStore = defineStore('terminal-labs', () => {
  const environment = shallowRef(createEnvironment(labIds[0]))
  const attemptId = ref<string>(globalThis.crypto.randomUUID())
  const finishing = ref(false)
  const saveResults = shallowRef<{ workshop?: SaveResult; learning?: SaveResult }>({})
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
    attemptId.value = globalThis.crypto.randomUUID()
    finishing.value = false
    saveResults.value = {}
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
    const changed = result.state.revision > environment.value.revision
    const review =
      environment.value.network && result.state.network
        ? reviewCommand(environment.value.network, result.state.network, result.ok)
        : undefined
    if (environment.value.network && result.state.revision > environment.value.revision)
      rollbackStates.value = [
        ...rollbackStates.value,
        structuredClone(environment.value.network),
      ].slice(-20)
    environment.value = result.state
    const record: TerminalRecord = {
      id: ++sequence,
      recordId: globalThis.crypto.randomUUID(),
      command: command.slice(0, 512),
      output: result.output,
      kind: result.kind,
      ok: result.ok,
      revision: result.state.revision,
      changed,
      observation: result.ok && !changed && !/^(help|cls|wait)(\s|$)/i.test(command.trim()),
      review,
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
    if (finished.value || finishing.value) return
    const result = assessLab(environment.value, diagnosis.value, hints.value)
    feedback.value = result
    if (!result.complete && mode.value !== 'exam') return
    const currentAttempt = attemptId.value,
      definition = environment.value.network?.definition
    const snapshot = {
      attemptId: currentAttempt,
      id: environment.value.labId,
      skill:
        definition?.skill ?? (environment.value.labId === 'TERM-ICMP-TCP' ? 'transport' : 'dns'),
      mode: mode.value,
      score: result.score,
      hints: hints.value,
      complete: result.complete,
      at: new Date().toISOString(),
      seed: variantSeed.value,
      causeFamily: causeForLab(environment.value.labId, definition?.fault),
      policyVersion: learningPolicy.version,
      competencies: result.checks
        .filter((c) => c.met)
        .map((c) => c.id)
        .slice(0, 10),
      errors: result.checks
        .filter((c) => !c.met)
        .map((c) => c.label.slice(0, 180))
        .slice(0, 10),
      variantKey: definition
        ? `${definition.client}/${definition.prefix}:${definition.server}:${definition.target}:${definition.fault}`
        : 'base',
    }
    finished.value = true
    finishing.value = true
    try {
      const results = await Promise.allSettled([
        useWorkshopStore().record(snapshot),
        snapshot.mode !== 'practice'
          ? useLearningStore().complete(snapshot.id, snapshot.score, currentAttempt)
          : Promise.resolve(undefined),
      ])
      const saved = (
        result: PromiseSettledResult<SaveResult | undefined>,
      ): SaveResult | undefined =>
        result.status === 'fulfilled'
          ? result.value
          : {
              status: 'failed',
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : 'Результат остался в памяти; сохранение не удалось.',
            }
      if (attemptId.value === currentAttempt)
        saveResults.value = { workshop: saved(results[0]!), learning: saved(results[1]!) }
    } catch (cause) {
      if (attemptId.value === currentAttempt)
        saveResults.value = {
          workshop: {
            status: 'failed',
            error: cause instanceof Error ? cause.message : 'Результат остался в памяти.',
          },
        }
    } finally {
      if (attemptId.value === currentAttempt) finishing.value = false
    }
  }
  function checkpoint(): Checkpoint {
    return checkpointSchema.parse({
      schemaVersion: 2,
      attemptId: attemptId.value,
      variantSeed: variantSeed.value,
      commandSequence: sequence,
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
    if ('attemptId' in valid && valid.attemptId) attemptId.value = valid.attemptId
    sequence = 'commandSequence' in valid ? (valid.commandSequence ?? 0) : 0
    environment.value = valid.environment
    hints.value = valid.hints
    diagnosis.value = valid.diagnosis ?? undefined
    finished.value = valid.finished
    if (valid.finished) feedback.value = assessLab(valid.environment, diagnosis.value, valid.hints)
  }
  return {
    attemptId,
    finishing,
    saveResults,
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
