<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, BookOpen, Compass, RotateCcw, Target } from '@lucide/vue'
import { tracks, workshopCourses } from '../workshop/courses'
import { useWorkshopStore } from '../workshop/useWorkshopStore'
import { buildSkillStatuses } from '../workshop/skills'
import { recommendNextTask } from '../workshop/recommendations'
import ContinueLearning from '../workshop/ContinueLearning.vue'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { saveNotice } from '../../shared/persistence'
import { journeyCourses, lessonJourney } from './journey'
import { useLearningClock } from './useLearningClock'
import LessonWorkspace from './LessonWorkspace.vue'
const store = useWorkshopStore(),
  route = useRoute(),
  router = useRouter(),
  now = useLearningClock()
const notice = ref(''),
  selectingTrack = ref(false)
onMounted(() => void store.initialize())
const courses = computed(() => journeyCourses(store.state))
const statuses = computed(() => buildSkillStatuses(store.state, now.value))
const recommendation = computed(() => recommendNextTask(store.state, now.value, statuses.value))
const selected = computed(
  () =>
    workshopCourses.find((course) => course.id === route.query.lesson) ??
    courses.value.find((course) => course.id === store.state.currentLesson) ??
    courses.value.find(
      (course) =>
        course.id ===
        ('lessonId' in recommendation.value ? recommendation.value.lessonId : undefined),
    ) ??
    courses.value[0]!,
)
watch(
  [() => store.ready, () => route.query.lesson],
  ([ready, id]) => {
    if (
      ready &&
      typeof id === 'string' &&
      workshopCourses.some((course) => course.id === id) &&
      store.state.currentLesson !== id
    )
      void store.selectLesson(id)
  },
  { immediate: true },
)
const progressView = computed(() => route.query.view === 'progress')
const independent = computed(
  () => courses.value.filter((course) => statuses.value[course.skill].independent > 0).length,
)
const reviewed = computed(
  () => courses.value.filter((course) => statuses.value[course.skill].retention).length,
)
const due = computed(() =>
  courses.value.filter((course) => statuses.value[course.skill].needsReview),
)
const understood = computed(
  () =>
    courses.value.filter((course) => lessonJourney(course, store.state, now.value).understood)
      .length,
)
async function selectTrack(value: string) {
  if (selectingTrack.value) return
  selectingTrack.value = true
  try {
    notice.value = saveNotice(await store.selectTrack(value), 'Направление выбрано.')
    await router.replace({
      path: '/learning',
      query: progressView.value ? { view: 'progress' } : {},
    })
  } finally {
    selectingTrack.value = false
  }
}
</script>

<template>
  <div class="learning-journey">
    <header class="journey-page-heading">
      <div>
        <span class="eyebrow">ВАШ УЧЕБНЫЙ ПУТЬ</span>
        <h1>
          {{
            progressView
              ? 'Как развивается ваш навык'
              : 'От первых проверок к самостоятельному решению'
          }}
        </h1>
        <p>
          Понятная задача, короткий материал, практика и разбор. Следующий шаг учитывает ваши
          результаты.
        </p>
      </div>
      <label class="journey-track"
        >Моя цель<AppSelect
          :model-value="store.state.track"
          :disabled="!store.ready || selectingTrack"
          class="text-input"
          @update:model-value="selectTrack"
          ><AppSelectOption v-for="track in tracks" :key="track.id" :value="track.id">{{
            track.title
          }}</AppSelectOption></AppSelect
        ></label
      >
    </header>
    <div class="journey-metrics" aria-label="Учебные результаты">
      <article>
        <BookOpen :size="20" /><strong
          >{{ understood }}<small>/ {{ courses.length }}</small></strong
        ><span>Тем с проверкой понимания</span>
      </article>
      <article>
        <Target :size="20" /><strong
          >{{ independent }}<small>/ {{ courses.length }}</small></strong
        ><span>Тем с самостоятельным решением</span>
      </article>
      <article>
        <RotateCcw :size="20" /><strong>{{ reviewed }}</strong
        ><span>Тем с проверкой после перерыва</span>
      </article>
    </div>
    <section class="journey-storage">
      <label class="checkbox-label"
        ><input
          :checked="store.enabled"
          type="checkbox"
          :disabled="!store.ready || store.saving"
          @change="store.toggle(($event.target as HTMLInputElement).checked)"
        />Сохранять мой учебный прогресс на этом устройстве</label
      ><span role="status">{{
        !store.ready
          ? 'Загрузка…'
          : store.saving
            ? 'Сохраняем…'
            : store.enabled
              ? 'Локальное сохранение включено'
              : 'Результаты в памяти до закрытия страницы'
      }}</span
      ><RouterLink to="/settings">Копия и восстановление</RouterLink>
    </section>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="store.error" role="alert">{{ store.error }}</p>
    <ContinueLearning :compact="true" />
    <section v-if="progressView" class="panel feature-section">
      <h2>Что означают эти результаты</h2>
      <p>
        Знакомство с материалом, один верный ответ, самостоятельное решение и повтор после перерыва
        показывают разные стороны обучения. Баллы симулятора не подтверждают квалификацию на
        настоящей системе.
      </p>
      <p v-if="due.length">
        Требуют внимания: {{ due.map((course) => course.title).join(', ') }}. В сегодняшней задаче
        предложен конкретный следующий шаг.
      </p>
      <p v-else>Сейчас нет назначенного повторения по этим темам. Продолжайте выбранный маршрут.</p>
      <RouterLink class="button primary" :to="recommendation.url"
        >Открыть рекомендованную задачу <ArrowRight :size="16"
      /></RouterLink>
    </section>
    <div class="journey-layout">
      <nav class="journey-path panel" aria-label="Занятия выбранного направления">
        <span class="eyebrow">{{
          store.state.track === 'L1' ? 'ПЕРВЫЙ МАРШРУТ · 5 ЗАНЯТИЙ' : 'ЗАНЯТИЯ ВАШЕГО НАПРАВЛЕНИЯ'
        }}</span>
        <h2>
          {{
            store.state.track === 'L1'
              ? 'Основы диагностики'
              : tracks.find((track) => track.id === store.state.track)?.title
          }}
        </h2>
        <RouterLink
          v-for="(course, index) in courses"
          :key="course.id"
          :to="{ path: '/learning', query: { lesson: course.id } }"
          class="journey-path-item"
          :class="{ active: selected.id === course.id && !progressView }"
          :aria-current="selected.id === course.id && !progressView ? 'step' : undefined"
          ><span class="journey-path-number"
            ><Check v-if="statuses[course.skill].independent" :size="17" /><template v-else>{{
              String(index + 1).padStart(2, '0')
            }}</template></span
          ><span
            ><strong>{{ course.title }}</strong
            ><small>{{ statuses[course.skill].level }}</small></span
          ><ArrowRight :size="16"
        /></RouterLink>
        <div class="journey-path-note">
          <Compass :size="20" />
          <p>
            Один самостоятельный случай — начало. Разные причины и повторение помогают увидеть, что
            получилось закрепить.
          </p>
        </div>
      </nav>
      <LessonWorkspace v-if="!progressView" :course="selected" />
      <section v-else class="panel feature-section">
        <h2>Решения и объяснения</h2>
        <p>
          После практики сохраните учебный отчёт и разберите его по рубрике. Собственные наблюдения,
          выбранное изменение и свежая проверка должны поддерживать вывод.
        </p>
        <div class="button-row">
          <RouterLink class="button secondary" to="/learning?view=workshop&workshop=portfolio"
            >Портфолио и разборы</RouterLink
          ><RouterLink class="button secondary" to="/learning?view=journal"
            >Журнал действий</RouterLink
          ><RouterLink class="button ghost" to="/learning?view=workshop&workshop=path"
            >Подробная карта навыков</RouterLink
          >
        </div>
      </section>
    </div>
    <section class="journey-explore">
      <div>
        <span class="eyebrow">ПОСЛЕ ОСНОВ</span>
        <h2>Расширяйте практику постепенно</h2>
        <p>
          Незнакомые инциденты, тематические задания и собственный стенд доступны, когда понадобится
          больше глубины.
        </p>
      </div>
      <div class="button-row">
        <RouterLink
          class="button secondary"
          to="/learning?view=workshop&workshop=professional&incident=unknown&new=1"
          >Неизвестный инцидент</RouterLink
        ><RouterLink class="button secondary" to="/learning?view=workshop&workshop=packages"
          >Углублённые задания</RouterLink
        ><RouterLink class="button ghost" to="/learning?view=workshop&workshop=stand"
          >Настоящий стенд</RouterLink
        >
      </div>
    </section>
  </div>
</template>
