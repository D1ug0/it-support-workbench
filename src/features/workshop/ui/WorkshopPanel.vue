<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'
import { confirmDiscardForms } from '../../../shared/unsavedChanges'
import '../../terminal/terminal.css'
import ContinueLearning from './learning/ContinueLearning.vue'
import { useWorkshopStore } from '../model/useWorkshopStore'
const store = useWorkshopStore(),
  route = useRoute(),
  tab = ref('path')
const SkillPathPanel = defineAsyncComponent(() => import('./learning/SkillPathPanel.vue'))
const BaselinePanel = defineAsyncComponent(() => import('./learning/BaselinePanel.vue'))
const CoursesPanel = defineAsyncComponent(() => import('./learning/CoursesPanel.vue'))
const PackagesPanel = defineAsyncComponent(() => import('./learning/PackagesPanel.vue'))
const ErrorPracticePanel = defineAsyncComponent(() => import('./learning/ErrorPracticePanel.vue'))
const ProfessionalPanel = defineAsyncComponent(
  () => import('./investigation/ProfessionalPanel.vue'),
)
const LabEditor = defineAsyncComponent(() => import('./authoring/LabEditor.vue'))
const CourseEditor = defineAsyncComponent(() => import('./authoring/CourseEditor.vue'))
const GraphEditor = defineAsyncComponent(() => import('./authoring/GraphEditor.vue'))
const TraceWorkshop = defineAsyncComponent(() => import('./investigation/TraceWorkshop.vue'))
const PortfolioPanel = defineAsyncComponent(() => import('./investigation/PortfolioPanel.vue'))
const StandResourcesPanel = defineAsyncComponent(() => import('./stand/StandResourcesPanel.vue'))
const ExchangePanel = defineAsyncComponent(() => import('./exchange/ExchangePanel.vue'))
const router = useRouter()
const authorTabIds = ['editor', 'course-editor', 'graphs', 'traces', 'exchange']
const authorMode = computed(() => route.query.mode === 'author' || authorTabIds.includes(tab.value))
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

const visibleTabs = computed(() =>
  tabs.filter(([id]) => authorMode.value === authorTabIds.includes(id!)),
)
function selectTab(id: string) {
  if (confirmDiscardForms(route)) {
    tab.value = id
    void router.replace({
      path: '/learning',
      query: { ...route.query, workshop: id, mode: authorMode.value ? 'author' : undefined },
    })
  }
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
    <ContinueLearning v-if="!authorMode" />
    <div class="workshop-mode-heading">
      <h2>{{ authorMode ? 'Авторская мастерская' : 'Углублённая практика' }}</h2>
      <RouterLink class="button ghost" to="/learning">Вернуться к учебному пути</RouterLink>
    </div>
    <p>
      {{
        authorMode
          ? 'Создавайте и обменивайтесь учебными материалами. Авторский контент требует отдельной предметной проверки.'
          : 'Выберите нужный формат практики. Основной маршрут и рекомендуемая задача остаются в учебном пути.'
      }}
    </p>
    <nav class="learning-mode-nav" aria-label="Разделы практикума">
      <button
        v-for="[id, title] in visibleTabs"
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
