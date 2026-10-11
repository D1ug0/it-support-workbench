<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { confirmDiscardForms } from '../../shared/unsavedChanges'
import '../terminal/terminal.css'
import ContinueLearning from './ContinueLearning.vue'
import { useWorkshopStore } from './useWorkshopStore'
const store = useWorkshopStore(),
  route = useRoute(),
  tab = ref('path')
const SkillPathPanel = defineAsyncComponent(() => import('./SkillPathPanel.vue'))
const BaselinePanel = defineAsyncComponent(() => import('./BaselinePanel.vue'))
const CoursesPanel = defineAsyncComponent(() => import('./CoursesPanel.vue'))
const PackagesPanel = defineAsyncComponent(() => import('./PackagesPanel.vue'))
const ErrorPracticePanel = defineAsyncComponent(() => import('./ErrorPracticePanel.vue'))
const ProfessionalPanel = defineAsyncComponent(() => import('./ProfessionalPanel.vue'))
const LabEditor = defineAsyncComponent(() => import('./LabEditor.vue'))
const CourseEditor = defineAsyncComponent(() => import('./CourseEditor.vue'))
const GraphEditor = defineAsyncComponent(() => import('./GraphEditor.vue'))
const TraceWorkshop = defineAsyncComponent(() => import('./TraceWorkshop.vue'))
const PortfolioPanel = defineAsyncComponent(() => import('./PortfolioPanel.vue'))
const StandResourcesPanel = defineAsyncComponent(() => import('./StandResourcesPanel.vue'))
const ExchangePanel = defineAsyncComponent(() => import('./ExchangePanel.vue'))
const tabs = [
  ['path', 'Карта навыков'],
  ['baseline', 'Стартовая проверка'],
  ['courses', 'Новые курсы'],
  ['packages', 'Углублённые пакеты'],
  ['error-practice', 'Разбор ошибок'],
  ['professional', 'Профессиональные инциденты'],
  ['editor', 'Редактор лабораторий'],
  ['course-editor', 'Редактор курсов'],
  ['graphs', 'Инциденты с развилками'],
  ['traces', 'События и трассы'],
  ['portfolio', 'Портфолио'],
  ['stand', 'Настоящий стенд'],
  ['exchange', 'Обмен и преподаватель'],
]

function selectTab(id: string) {
  if (confirmDiscardForms(route)) tab.value = id
}
watch(
  () => [route.query.workshop, route.query.lesson] as const,
  ([value, lesson]) => {
    if (tabs.some(([id]) => id === value)) tab.value = String(value)
    else if (typeof lesson === 'string') tab.value = 'courses'
  },
  { immediate: true },
)
onMounted(() => store.initialize())
</script>
<template>
  <div class="workshop-root">
    <ContinueLearning />
    <h2>Практикум развития</h2>
    <p>
      Пять учебных траекторий, самостоятельные лаборатории и понятная карта навыков. Выберите
      направление и переходите от материала к проверяемому результату.
    </p>
    <nav class="learning-mode-nav" aria-label="Разделы практикума">
      <button
        v-for="[id, title] in tabs"
        :key="id"
        :class="['button', tab === id ? 'primary' : 'secondary']"
        :aria-pressed="tab === id"
        @click="selectTab(id!)"
      >
        {{ title }}
      </button>
    </nav>
    <label class="checkbox-label"
      ><input
        :checked="store.enabled"
        type="checkbox"
        :disabled="!store.ready"
        @change="store.toggle(($event.target as HTMLInputElement).checked)"
      />Сохранять навыки и результаты практикума на устройстве</label
    >
    <p>
      По умолчанию результаты в памяти. Записываются только ID, режим, вариант, подсказки, оценка,
      дата, первые ответы коротких занятий, знакомство с уроками и выбранный маршрут. Выключение
      останавливает запись; удаление — отдельное действие.
    </p>
    <details v-if="store.problems.length">
      <summary>Проблемные записи ({{ store.problems.length }})</summary>
      <ul>
        <li v-for="p in store.problems" :key="`${p.collection}:${p.id}`">
          {{ p.collection }} / {{ p.id }}: {{ p.reason }}
        </li>
      </ul>
      <RouterLink to="/settings">Экспорт исходных записей и восстановление</RouterLink>
    </details>
    <p v-if="store.error" role="alert">{{ store.error }}</p>
    <button v-if="store.error" class="button secondary" @click="store.reloadSaved()">
      Перечитать сохранённый прогресс вместо текущего
    </button>
    <SkillPathPanel v-if="tab === 'path'" />
    <BaselinePanel v-if="tab === 'baseline'" />
    <CoursesPanel v-if="tab === 'courses'" />
    <PackagesPanel v-if="tab === 'packages'" />
    <ErrorPracticePanel v-if="tab === 'error-practice'" />
    <KeepAlive><ProfessionalPanel v-if="tab === 'professional'" /></KeepAlive>
    <LabEditor v-if="tab === 'editor'" />
    <CourseEditor v-if="tab === 'course-editor'" />
    <GraphEditor v-if="tab === 'graphs'" />
    <TraceWorkshop v-if="tab === 'traces'" />
    <PortfolioPanel v-if="tab === 'portfolio'" />
    <StandResourcesPanel v-if="tab === 'stand'" />
    <ExchangePanel v-if="tab === 'exchange'" />
  </div>
</template>
