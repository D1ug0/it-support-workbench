<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { trainingTraces, parseTrace, type TrainingTrace } from './traces'
import { downloadText } from '../../infrastructure/export/exportReport'
const selected = ref(0),
  value = ref<TrainingTrace>(trainingTraces[0]!),
  revealed = ref(false),
  filter = ref('Все'),
  answer = ref(''),
  error = ref('')
const events = computed(() =>
  value.value.events.filter((e) => filter.value === 'Все' || e.layer === filter.value),
)
const firstFailure = computed(() => value.value.events.find((e) => e.result === 'failure'))
let version = 0
onBeforeUnmount(() => version++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file) return
  const ticket = ++version
  try {
    if (file.size > 131072) throw new Error('Лимит 128 KiB.')
    const parsed = parseTrace(await file.text())
    if (ticket === version) {
      value.value = parsed
      revealed.value = false
      answer.value = ''
      error.value = ''
    }
  } catch (e) {
    if (ticket === version) error.value = e instanceof Error ? e.message : 'Ошибка трассы.'
  } finally {
    input.value = ''
  }
}
function change() {
  value.value = trainingTraces[selected.value]!
  answer.value = ''
  revealed.value = false
}
</script>
<template>
  <section class="panel feature-section">
    <h2>События и учебные трассы</h2>
    <p>
      Временная линия показывает отдельные уровни проверки. Формат — ограниченный JSON, не
      PCAP/EVTX. Импортированные данные остаются в памяти и скрыты до явного раскрытия.
    </p>
    <label
      >Пример трассы<select v-model="selected" class="text-input" @change="change">
        <option v-for="(t, i) in trainingTraces" :key="t.title" :value="i">{{ t.title }}</option>
      </select></label
    >
    <label
      >Импорт трассы JSON<input type="file" accept=".json,application/json" @change="read"
    /></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>
      Источник:
      {{
        value.origin === 'synthetic'
          ? 'синтетический пример'
          : 'ручной экспорт; корректность источника не подтверждена'
      }}
      · {{ value.events.length }} событий.
    </p>
    <label class="checkbox-label"
      ><input v-model="revealed" type="checkbox" />Показать содержимое событий; оно может содержать
      чувствительные данные</label
    >
    <label
      >Уровень<select v-model="filter" class="text-input">
        <option>Все</option>
        <option v-for="layer in ['DNS', 'ICMP', 'TCP', 'TLS', 'HTTP', 'SERVICE']" :key="layer">
          {{ layer }}
        </option>
      </select></label
    >
    <ol class="trace-timeline">
      <li v-for="(e, i) in events" :key="i">
        <strong>T+{{ e.time }} с · {{ e.layer }} · {{ e.result }}</strong>
        <p>{{ revealed ? e.detail : 'Содержимое скрыто' }}</p>
      </li>
    </ol>
    <label
      >Первый наблюдаемый отказ<select v-model="answer" class="text-input">
        <option value="">Выберите уровень</option>
        <option v-for="layer in ['DNS', 'ICMP', 'TCP', 'TLS', 'HTTP', 'SERVICE']" :key="layer">
          {{ layer }}
        </option>
      </select></label
    >
    <p v-if="answer" role="status">
      {{
        answer === firstFailure?.layer
          ? 'Первый отказ выбран верно. Проверьте последующие события: он может не препятствовать работе другого протокола.'
          : 'Сопоставьте время и результат событий. Первый отказ — наблюдение, а не окончательный диагноз.'
      }}
    </p>
    <button
      class="button ghost"
      @click="
        downloadText(
          JSON.stringify(trainingTraces[selected], null, 2),
          'workbench-trace-example.json',
          'application/json;charset=utf-8',
        )
      "
    >
      Скачать синтетический шаблон трассы
    </button>
  </section>
</template>
