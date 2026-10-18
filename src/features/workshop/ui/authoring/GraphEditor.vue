<script setup lang="ts">
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  sampleGraph,
  parseGraph,
  startGraph,
  chooseGraph,
  abandonGraph,
  type IncidentGraph,
  type GraphAttempt,
} from '../../domain/graph'
import { useRoute } from 'vue-router'
import { incidentPresets, graphDebrief } from '../../domain/incidentPresets'
import { useWorkshopStore } from '../../model/useWorkshopStore'
import { downloadText } from '../../../../infrastructure/export/exportReport'
import GraphForm from './GraphForm.vue'
import { confirmDiscardForms, useUnsavedChanges } from '../../../../shared/unsavedChanges'
import type { MaterialTokens } from '../../infrastructure/materialsRepository'
const store = useWorkshopStore(),
  route = useRoute()
const attemptId = ref<string>(globalThis.crypto.randomUUID())
const preset = ref(incidentPresets.find((p) => p.id === route.query.preset)?.id ?? 'WEB')
function loadPreset() {
  if (busy.value || !confirmDiscardForms()) return
  const source = incidentPresets.find((p) => p.id === preset.value)!.graph
  text.value = JSON.stringify({ ...source, id: `GRAPH-${globalThis.crypto.randomUUID()}` }, null, 2)
  preview()
  expected.value = {}
  markSaved()
}
function exportAttempt() {
  if (graph.value && attempt.value)
    downloadText(
      `Попытка ${attemptId.value}; статус ${attempt.value.status}; цели подтверждены: ${attempt.value.goalsMet ? 'да' : 'нет'}. Доказательства: ${attempt.value.proofs.join(', ') || 'нет'}.\n\n` +
        graphDebrief(graph.value, attempt.value.steps, attempt.value.score),
      'workbench-incident-debrief.md',
    )
}
const text = ref(
    JSON.stringify({ ...sampleGraph, id: `GRAPH-${globalThis.crypto.randomUUID()}` }, null, 2),
  ),
  consent = ref(false),
  error = ref(''),
  notice = ref(''),
  busy = ref(false)
const expected = ref<MaterialTokens>({})
const { markSaved } = useUnsavedChanges(() => text.value)
const graph = ref<IncidentGraph>(),
  attempt = ref<GraphAttempt>(),
  feedback = ref('')
const node = computed(() => graph.value?.nodes.find((n) => n.id === attempt.value?.node))
function preview() {
  try {
    graph.value = parseGraph(text.value)
    attemptId.value = globalThis.crypto.randomUUID()
    attempt.value = startGraph(graph.value)
    error.value = ''
    feedback.value = ''
  } catch (e) {
    graph.value = undefined
    attempt.value = undefined
    feedback.value = ''
    error.value = e instanceof Error ? e.message : 'Ошибка сценария.'
  }
}
function restartAttempt() {
  attemptId.value = globalThis.crypto.randomUUID()
  if (graph.value) attempt.value = startGraph(graph.value)
  feedback.value = ''
}
function openStored(value: IncidentGraph) {
  if (busy.value || !confirmDiscardForms()) return
  text.value = JSON.stringify(value, null, 2)
  expected.value = store.tokensFor('graphs', [value.id])
  consent.value = false
  preview()
  markSaved()
}
function choose(index: number) {
  if (!graph.value || !attempt.value) return
  feedback.value = node.value!.choices[index]!.explanation
  attempt.value = chooseGraph(graph.value, attempt.value, index)
  if (attempt.value.finished) void recordOutcome()
}
async function recordOutcome() {
  if (!graph.value || !attempt.value) return
  await store.addEvent({
    attemptId: attemptId.value,
    module: 'graph',
    taskId: graph.value.id,
    at: new Date().toISOString(),
    score: attempt.value.score,
    outcome:
      attempt.value.status === 'completed' && !attempt.value.goalsMet
        ? 'failed'
        : attempt.value.status === 'active'
          ? 'abandoned'
          : attempt.value.status,
  })
}
function abandon() {
  if (attempt.value) {
    attempt.value = abandonGraph(attempt.value)
    void recordOutcome()
  }
}
async function save() {
  if (busy.value) return
  if (!consent.value) {
    error.value = 'Подтвердите учебные данные.'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  const before = text.value
  try {
    const graph = parseGraph(before)
    const stored = await store.saveGraph(graph, expected.value)
    expected.value = { ...expected.value, ...stored }
    markSaved(before)
    notice.value = 'Сценарий сохранён.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка сохранения.'
  } finally {
    busy.value = false
  }
}
function exportGraph() {
  try {
    downloadText(
      JSON.stringify(parseGraph(text.value), null, 2),
      'workbench-incident-graph.json',
      'application/json;charset=utf-8',
    )
  } catch {
    error.value = 'Сначала исправьте сценарий.'
  }
}
let version = 0
onBeforeUnmount(() => version++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  if (busy.value || !confirmDiscardForms()) {
    input.value = ''
    return
  }
  const ticket = ++version
  try {
    if (file.size > 131072) throw new Error('Лимит 128 KiB.')
    const value = parseGraph(await file.text())
    if (ticket === version) {
      text.value = JSON.stringify(value, null, 2)
      expected.value = store.tokensFor('graphs', [value.id])
      consent.value = false
      preview()
    }
  } catch (e) {
    if (ticket === version) error.value = e instanceof Error ? e.message : 'Ошибка импорта.'
  } finally {
    input.value = ''
  }
}
async function remove(id: string) {
  try {
    await store.removeGraph(id)
    expected.value = { ...expected.value, [id]: null }
  } catch {
    error.value = 'Удаление не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Инциденты с развилками</h2>
    <p>
      Конструктор описывает этапы и варианты действий. Проверяются ссылки, достижимость и путь к
      завершению. Циклы разрешены с выходом; попытка ограничена 40 переходами. Встроенные линейные
      сценарии доступны в прежнем тренажёре.
    </p>
    <label
      >Готовое расследование<AppSelect v-model="preset" class="text-input">
        <AppSelectOption v-for="p in incidentPresets" :key="p.id" :value="p.id">{{
          p.graph.title
        }}</AppSelectOption>
      </AppSelect></label
    ><button class="button secondary" @click="loadPreset">Открыть учебное расследование</button>
    <GraphForm v-model="text" />
    <details>
      <summary>Расширенное редактирование JSON графа</summary>
      <label
        >Сценарий графа JSON<textarea
          v-model="text"
          class="text-input workshop-json"
          rows="12"
          maxlength="131072"
          spellcheck="false"
        />
      </label>
    </details>
    <label
      >Открыть JSON графа<input type="file" accept=".json,application/json" @change="read"
    /></label>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Сценарий содержит только учебные данные</label
    >
    <div class="button-row">
      <button class="button primary" @click="preview">Проверить и пройти сценарий</button
      ><button class="button secondary" :disabled="busy" @click="save">Сохранить граф</button
      ><button class="button ghost" @click="exportGraph">Экспорт графа JSON</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section v-if="graph && attempt" class="workshop-item">
      <h3>{{ graph.title }}</h3>
      <template v-if="!attempt.finished"
        ><p>{{ node?.prompt }}</p>
        <div class="workshop-choices">
          <button
            v-for="(choice, index) in node?.choices"
            :key="index"
            class="button secondary"
            @click="choose(index)"
          >
            {{ choice.label }}
          </button>
        </div></template
      >
      <p v-else>
        {{
          attempt.status === 'completed'
            ? attempt.goalsMet
              ? 'Сценарий завершён; цели подтверждены'
              : 'END достигнут; учебные цели не подтверждены'
            : attempt.status === 'limit-reached'
              ? 'Лимит переходов: задача не решена'
              : 'Попытка прервана'
        }}
        · {{ attempt.score }}/100 · {{ attempt.steps.length }} действий.
        {{ attempt.steps.length >= 40 ? 'Достигнут лимит переходов.' : '' }}
      </p>
      <p v-if="graph.objectives">
        Цели: {{ graph.objectives.join(', ') }}. Подтверждено:
        {{ attempt.proofs.join(', ') || 'пока нет' }}.
      </p>
      <p role="status">{{ feedback }}</p>
      <button v-if="attempt.finished" class="button secondary" @click="exportAttempt">
        Экспорт разбора попытки
      </button>
      <button v-if="!attempt.finished" class="button ghost" @click="abandon">
        Прервать попытку
      </button>
      <button class="button ghost" @click="restartAttempt">Начать сценарий заново</button>
    </section>
    <div v-for="g in store.customGraphs" :key="g.id" class="workshop-item">
      <strong>{{ g.title }}</strong
      ><button class="button secondary" @click="openStored(g)">Открыть граф</button
      ><button class="button ghost" @click="remove(g.id)">Удалить граф</button>
    </div>
  </section>
</template>
