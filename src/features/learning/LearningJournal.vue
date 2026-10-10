<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLearningStore } from './useLearningStore'
import { allLearningQuestions } from './catalog'
import { academyCourses } from '../academy/catalog'
import { practiceTasks } from '../practice/catalog'
import { scenarios } from '../simulator/scenarios'
import { terminalLabs } from '../terminal/catalog'
import { learningSummary } from './journal'
import { downloadText } from '../../infrastructure/export/exportReport'
const store = useLearningStore()
const now = ref(Date.now())
const summary = computed(() => {
  void store.state.journal.length
  return learningSummary(store.state, Math.max(now.value, Date.now()))
})
const filter = ref('Все')
const page = ref(0)
const entries = computed(() =>
  [...store.state.journal]
    .reverse()
    .filter(
      (e) =>
        filter.value === 'Все' ||
        e.kind === filter.value ||
        (filter.value === 'terminal' && e.taskId.startsWith('TERM-')),
    ),
)
const target = ref(store.state.weeklyGoal)
const error = ref('')
watch(
  () => store.state.weeklyGoal,
  (value) => (target.value = value),
)
function title(id: string) {
  return (
    allLearningQuestions.find((q) => q.id === id)?.prompt ??
    practiceTasks.find((t) => `PRACTICE-${t.id}` === id)?.title ??
    academyCourses.find((c) => `LAB-${c.id}` === id)?.title ??
    scenarios.find((s) => s.id === id)?.title ??
    terminalLabs.find((lab) => lab.id === id)?.title ??
    (id.startsWith('USR-') ? 'Собственный учебный инцидент' : id)
  )
}
const formatDate = (v: string) => new Date(v).toLocaleString('ru-RU')
async function goal() {
  try {
    await store.setGoal(target.value)
    now.value = Date.now()
    error.value = ''
  } catch {
    error.value = 'Цель должна быть целым числом от 1 до 200.'
  }
}
function exportJournal() {
  downloadText(
    [
      '# Журнал обучения',
      `Цель на неделю: ${store.state.weeklyGoal}`,
      ...store.state.journal.map((e) => `- ${e.at} · ${title(e.taskId)} · ${e.score}/100`),
    ].join('\n'),
    'workbench-learning-journal.md',
  )
}
</script>
<template>
  <section class="panel feature-section" aria-labelledby="journal-title">
    <span class="eyebrow">ЛИЧНЫЙ МАРШРУТ</span>
    <h2 id="journal-title">Журнал обучения и цель недели</h2>
    <p>
      Неделя с {{ summary.start }}. Учебное действие — ответ, завершение лабораторной, инцидента или
      самостоятельная попытка. Количество действий показывает практику, а не квалификацию.
    </p>
    <div class="learning-metrics">
      <div>
        <strong>{{ summary.completed }} / {{ summary.goal }}</strong
        ><span>действий за неделю</span>
      </div>
      <div>
        <strong>{{ summary.success }}%</strong><span>попыток с оценкой ≥70</span>
      </div>
      <div>
        <strong>{{ store.state.journal.length }} / 500</strong><span>сохранённых событий</span>
      </div>
    </div>
    <button class="button ghost small" @click="now = Date.now()">Обновить период</button>
    <progress
      :value="Math.min(summary.completed, summary.goal)"
      :max="summary.goal"
      aria-label="Учебная цель недели"
    />
    <form class="form-grid" @submit.prevent="goal">
      <label
        >Цель на неделю<input
          v-model.number="target"
          class="text-input"
          type="number"
          min="1"
          max="200"
          required /></label
      ><button class="button primary small" :disabled="store.saving || !store.ready">
        Сохранить учебную цель
      </button>
    </form>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <div class="week-chart" aria-label="Учебная активность по дням">
      <div v-for="day in summary.days" :key="day.date">
        <strong>{{ day.count }}</strong
        ><span>{{ day.date }}</span
        ><progress
          :value="day.count"
          :max="Math.max(1, ...summary.days.map((d) => d.count))"
          :aria-label="`${day.date}: ${day.count} действий`"
        />
      </div>
    </div>
    <p>
      Расчёт активности использует последние 500 событий. Они хранятся без введённых ответов и
      диагностических данных. Старым счётчикам не приписывается история. Даты зависят от часов
      устройства; хранение включается общим переключателем.
    </p>
  </section>
  <section class="panel feature-section">
    <h3>История попыток</h3>
    <div class="button-row">
      <label
        >Тип учебного события<select v-model="filter" class="text-input" @change="page = 0">
          <option>Все</option>
          <option value="question">Ответы</option>
          <option value="scenario">Лабораторные и инциденты</option>
          <option value="practice">Самостоятельная практика</option>
          <option value="terminal">Терминальные лаборатории</option>
        </select></label
      ><button class="button secondary small" @click="exportJournal">
        Скачать журнал обучения
      </button>
    </div>
    <p v-if="!entries.length">Начните практику — здесь появятся даты и результаты попыток.</p>
    <ol class="learning-event-list">
      <li v-for="(entry, index) in entries.slice(page * 20, (page + 1) * 20)" :key="index">
        <time :datetime="entry.at">{{ formatDate(entry.at) }}</time
        ><span>{{ title(entry.taskId) }}</span
        ><strong>{{ entry.score }} / 100</strong>
      </li>
    </ol>
    <div v-if="entries.length > 20" class="button-row">
      <button class="button secondary small" :disabled="page === 0" @click="page--">
        Новые события</button
      ><span>{{ page + 1 }} / {{ Math.ceil(entries.length / 20) }}</span
      ><button
        class="button secondary small"
        :disabled="(page + 1) * 20 >= entries.length"
        @click="page++"
      >
        Предыдущие события
      </button>
    </div>
  </section>
</template>
