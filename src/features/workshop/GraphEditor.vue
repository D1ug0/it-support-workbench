<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  sampleGraph,
  parseGraph,
  startGraph,
  chooseGraph,
  type IncidentGraph,
  type GraphAttempt,
} from './graph'
import { useRoute } from 'vue-router'
import { incidentPresets, graphDebrief } from './incidentPresets'
import { useWorkshopStore } from './useWorkshopStore'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useWorkshopStore(),
  route = useRoute()
const preset = ref(incidentPresets.find((p) => p.id === route.query.preset)?.id ?? 'WEB')
function loadPreset() {
  const source = incidentPresets.find((p) => p.id === preset.value)!.graph
  text.value = JSON.stringify({ ...source, id: `GRAPH-${globalThis.crypto.randomUUID()}` }, null, 2)
  preview()
}
function exportAttempt() {
  if (graph.value && attempt.value)
    downloadText(
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
const graph = ref<IncidentGraph>(),
  attempt = ref<GraphAttempt>(),
  feedback = ref('')
const node = computed(() => graph.value?.nodes.find((n) => n.id === attempt.value?.node))
function preview() {
  try {
    graph.value = parseGraph(text.value)
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
  if (graph.value) attempt.value = startGraph(graph.value)
  feedback.value = ''
}
function openStored(value: IncidentGraph) {
  text.value = JSON.stringify(value, null, 2)
  preview()
}
function choose(index: number) {
  if (!graph.value || !attempt.value) return
  feedback.value = node.value!.choices[index]!.explanation
  attempt.value = chooseGraph(graph.value, attempt.value, index)
}
async function save() {
  if (!consent.value) {
    error.value = 'Подтвердите учебные данные.'
    return
  }
  busy.value = true
  try {
    await store.saveGraph(parseGraph(text.value))
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
  const ticket = ++version
  try {
    if (file.size > 131072) throw new Error('Лимит 128 KiB.')
    const value = parseGraph(await file.text())
    if (ticket === version) {
      text.value = JSON.stringify(value, null, 2)
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
  } catch {
    error.value = 'Удаление не удалось.'
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h2>Инциденты с развилками</h2>
    <p>
      JSON описывает узлы и варианты действий. Проверяются ссылки, достижимость и путь к завершению.
      Циклы разрешены с выходом; попытка ограничена 40 переходами. Встроенные линейные сценарии
      доступны в прежнем тренажёре.
    </p>
    <label
      >Готовое расследование<select v-model="preset" class="text-input">
        <option v-for="p in incidentPresets" :key="p.id" :value="p.id">{{ p.graph.title }}</option>
      </select></label
    ><button class="button secondary" @click="loadPreset">Открыть учебное расследование</button>
    <label
      >Сценарий графа JSON<textarea
        v-model="text"
        class="text-input workshop-json"
        rows="12"
        maxlength="131072"
        spellcheck="false"
      />
    </label>
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
        Сценарий завершён · {{ attempt.score }}/100 · {{ attempt.steps.length }} действий.
        {{ attempt.steps.length >= 40 ? 'Достигнут лимит переходов.' : '' }}
      </p>
      <p role="status">{{ feedback }}</p>
      <button v-if="attempt.finished" class="button secondary" @click="exportAttempt">
        Экспорт разбора попытки
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
