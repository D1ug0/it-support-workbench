<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  GraduationCap,
  ArrowRight,
  RotateCcw,
  ArrowLeft,
  Check,
  ShieldCheck,
  Trophy,
  ChevronRight,
  Clock3,
} from '@lucide/vue'
import { scenarios } from '../features/simulator/scenarios'
import { chooseAction, initialSimulation, simulationScore } from '../features/simulator/engine'
import type { Scenario } from '../features/simulator/engine'
import { useLearningStore } from '../features/learning/useLearningStore'
import ScenarioEditor from '../features/simulator/ScenarioEditor.vue'
import { listScenarios } from '../features/simulator/customRepository'
const custom = ref<Scenario[]>([])
const loadError = ref('')
const allScenarios = computed(() => [...scenarios, ...custom.value])
onMounted(async () => {
  try {
    custom.value = await listScenarios()
  } catch {
    loadError.value = 'Пользовательские сценарии не загружены: хранилище браузера недоступно.'
  }
})
const learning = useLearningStore()
const selected = ref<Scenario>()
const state = ref(initialSimulation())
const current = computed(() => selected.value?.steps[state.value.step])
const latest = computed(() => state.value.history.at(-1))
function start(scenario: Scenario) {
  selected.value = scenario
  state.value = initialSimulation()
}
const route = useRoute()
watch(
  () => [route.query.scenario, custom.value] as const,
  ([value]) => {
    const scenario = allScenarios.value.find((item) => item.id === value)
    if (scenario && selected.value?.id !== scenario.id) start(scenario)
  },
  { immediate: true },
)
function choose(id: string) {
  if (selected.value) {
    const wasCompleted = state.value.completed
    state.value = chooseAction(selected.value, state.value, id)
    if (!wasCompleted && state.value.completed)
      void learning.complete(selected.value.id, simulationScore(state.value))
  }
}
function reset() {
  state.value = initialSimulation()
}
function leaveScenario() {
  selected.value = undefined
  reset()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">УЧЕБНЫЕ ИНЦИДЕНТЫ</span>
      <h1>Практика без риска<span class="accent">.</span></h1>
      <p>Учебные инциденты. Вымышленные системы. Настоящая логика диагностики.</p>
    </div>
    <span class="tag">{{ allScenarios.length }} СЦЕНАРИЕВ</span>
  </div>
  <nav class="learning-mode-nav" aria-label="Режим тренажёра">
    <RouterLink to="/terminal">Вводить команды в терминале</RouterLink>
    <RouterLink to="/simulator">Проходить инциденты</RouterLink
    ><RouterLink to="/simulator?view=editor">Редактор инцидентов</RouterLink>
  </nav>
  <p v-if="loadError" role="alert">{{ loadError }}</p>
  <ScenarioEditor v-if="route.query.view === 'editor'" @updated="custom = $event" />
  <template v-else-if="!selected"
    ><div class="simulator-intro panel">
      <GraduationCap :size="29" />
      <div>
        <h2>Сначала проверка, потом действие</h2>
        <p>
          Выбирайте следующий шаг, получайте синтетические результаты и объяснения. За поспешные
          выводы и небезопасные действия снижается оценка.
        </p>
      </div>
      <span class="tag">ДЕТЕРМИНИРОВАННЫЙ ТРЕНАЖЁР</span>
    </div>
    <div class="scenario-grid">
      <button
        v-for="(scenario, index) in allScenarios"
        :key="scenario.id"
        class="panel scenario-card"
        @click="start(scenario)"
      >
        <div class="command-card-top">
          <span class="tag">{{ scenario.category }}</span
          ><span class="example-number">{{ String(index + 1).padStart(2, '0') }}</span>
        </div>
        <span class="scenario-id">{{ scenario.id }}</span>
        <h2>{{ scenario.title }}</h2>
        <p>{{ scenario.brief }}</p>
        <div class="scenario-footer">
          <span
            ><Clock3 :size="13" /> {{ scenario.steps.length }} этапа ·
            {{ scenario.difficulty }}</span
          ><ArrowRight :size="18" />
        </div>
      </button>
    </div>
    <div class="training-note">
      <ShieldCheck :size="18" />
      <p>
        Никакие команды не выполняются. Камеры, весы и кассовое оборудование рассматриваются
        теоретически, без привязки к производителю. Реальная работа требует регламентов и
        разрешений.
      </p>
    </div></template
  ><template v-else
    ><div class="simulator-toolbar">
      <button class="button ghost" @click="leaveScenario">
        <ArrowLeft :size="15" /> Все сценарии</button
      ><button class="button secondary small" @click="reset">
        <RotateCcw :size="14" /> Начать заново
      </button>
    </div>
    <div class="simulation-layout">
      <section class="panel simulation-main">
        <div class="panel-heading">
          <div>
            <GraduationCap :size="19" />
            <h2>{{ selected.title }}</h2>
          </div>
          <span class="tag">{{ selected.id }}</span>
        </div>
        <div class="simulation-context">
          <span class="eyebrow">УСЛОВИЯ ЗАЯВКИ</span>
          <p>{{ selected.brief }}</p>
          <pre>{{ selected.context }}</pre>
        </div>
        <div class="simulation-progress">
          <div>
            <span
              >Этап {{ Math.min(state.step + 1, selected.steps.length) }} из
              {{ selected.steps.length }}</span
            ><span>{{ state.completed ? 'Завершён' : 'Учебная среда' }}</span>
          </div>
          <progress
            :value="state.step"
            :max="selected.steps.length"
            aria-label="Прогресс сценария"
          />
        </div>
        <div v-if="current" class="simulation-step">
          <h2>{{ current.question }}</h2>
          <div class="simulation-choices">
            <button
              v-for="choice in current.choices"
              :key="choice.id"
              :disabled="state.attempted.includes(`${current.id}:${choice.id}`)"
              @click="choose(choice.id)"
            >
              <span>{{ choice.label }}</span
              ><ChevronRight :size="16" />
            </button>
          </div>
        </div>
        <div
          v-if="latest && !state.completed"
          class="simulation-feedback"
          :class="{ correct: latest.correct }"
          role="status"
        >
          <span class="tag">{{
            latest.correct
              ? 'ПРОВЕРКА ОБОСНОВАНА'
              : latest.safe
                ? 'ПОПРОБУЙТЕ ДРУГОЙ ШАГ'
                : 'ДЕЙСТВИЕ НЕ СОГЛАСОВАНО'
          }}</span>
          <pre>{{ latest.result }}</pre>
          <p>{{ latest.explanation }}</p>
        </div>
        <div v-if="state.completed" class="simulation-complete" role="status">
          <span class="trophy-icon"><Trophy :size="35" /></span
          ><span class="eyebrow">СЦЕНАРИЙ ЗАВЕРШЁН</span>
          <h2>{{ simulationScore(state) }}<span> / 100</span></h2>
          <p>{{ selected.resolution }}</p>
          <RouterLink to="/learning">Посмотреть учебный прогресс</RouterLink>
          <button class="button primary" @click="leaveScenario">
            Следующий сценарий <ArrowRight :size="16" />
          </button>
        </div>
      </section>
      <aside class="panel simulation-journal">
        <div class="panel-heading">
          <div><h2>Журнал проверок</h2></div>
          <span class="tag">{{ state.history.length }}</span>
        </div>
        <div v-if="!state.history.length" class="journal-empty">
          Выберите первую проверку.<br />Результаты появятся здесь.
        </div>
        <ol v-else>
          <li v-for="(item, index) in state.history" :key="index">
            <span class="journal-marker" :class="{ correct: item.correct }"
              ><Check v-if="item.correct" :size="12" /><span v-else>!</span></span
            ><strong>{{ item.label }}</strong>
            <details>
              <summary>Результат и объяснение</summary>
              <pre>{{ item.result }}</pre>
              <p>{{ item.explanation }}</p>
            </details>
          </li>
        </ol>
        <div class="journal-score">
          <span>Ошибок: {{ state.mistakes }}</span
          ><strong>{{ simulationScore(state) }} / 100</strong>
        </div>
      </aside>
    </div></template
  >
</template>
