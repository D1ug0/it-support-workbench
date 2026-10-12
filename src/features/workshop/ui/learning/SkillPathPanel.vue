<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkshopStore } from '../../model/useWorkshopStore'
import { saveNotice } from '../../../../shared/persistence'
import { useRouter } from 'vue-router'
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import { skills, buildSkillStatuses, type SkillId } from '../../domain/skills'
import { workshopCourses, tracks } from '../../domain/courses'
import { todayTask } from '../../application/learningFlow'
import { standTasks } from '../../domain/stand'
import { useLearningClock } from '../../../learning/useLearningClock'
const store = useWorkshopStore()
const notice = ref('')
const router = useRouter()
const now = useLearningClock()
const statuses = computed(() => buildSkillStatuses(store.state, now.value))
const task = computed(() => todayTask(store.state, now.value, statuses.value))
const standLinks: Partial<Record<SkillId, string>> = Object.fromEntries(
  standTasks.map((t) => [t.skill, `/learning?view=workshop&workshop=stand&task=${t.id}`]),
)
function prerequisites(ids: readonly SkillId[]) {
  return ids.map((id) => skills.find((s) => s.id === id)?.title).join(', ')
}
async function track(value: string) {
  notice.value = saveNotice(await store.selectTrack(value), 'Направление сохранено.')
}
function openCourse(id: string) {
  void router.push({
    path: '/learning',
    query: { lesson: id },
  })
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Ваш учебный маршрут</h3>
    <label
      >Направление<AppSelect :model-value="store.state.track" class="text-input" @change="track">
        <AppSelectOption v-for="t in tracks" :key="t.id" :value="t.id">{{
          t.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <p>
      <strong>Рекомендуется: {{ task.title }}</strong
      >. {{ task.reason }}
    </p>
    <RouterLink class="button primary" :to="task.url">Открыть следующий шаг</RouterLink>
    <p>
      Самостоятельное владение требует разных семейств причин и компетенций. Косметические варианты
      адресов этого не подтверждают. Для перехода дальше нужны две разные причины, компетенции и
      формы теории. Для Windows, Linux, IPv6 и Wi-Fi после единственной причины модели маршрут
      продолжается на настоящем стенде; владение навыком этим не подтверждается. Отложенная проверка
      через неделю подтверждается новой причиной или двумя разными причинами в течение суток; она не
      задерживает изучение следующей темы. Это учебный показатель. Повторение предлагается после
      затруднения или через неделю.
    </p>
  </section>
  <div class="workshop-grid">
    <article v-for="skill in skills" :key="skill.id" class="panel feature-section">
      <h3>{{ skill.title }}</h3>
      <p>{{ statuses[skill.id].level }}</p>
      <p>
        Попыток: {{ statuses[skill.id].attempts }} · самостоятельно:
        {{ statuses[skill.id].independent }}
      </p>
      <p>
        {{ statuses[skill.id].theory }}. Семейств причин: {{ statuses[skill.id].causeFamilies }}.
        Отложенная проверка: {{ statuses[skill.id].retention ? 'подтверждена' : 'предстоит' }}.
        Отчётов стенда (самостоятельно): {{ statuses[skill.id].standReports }}.
      </p>
      <p v-if="statuses[skill.id].readyToAdvance">Основа для следующей темы подтверждена.</p>
      <ul>
        <li v-for="c in statuses[skill.id].confirmed" :key="c">{{ c }}</li>
      </ul>
      <p v-if="skill.requires.length">
        Основы:
        {{ prerequisites(skill.requires) }}
      </p>
      <p v-if="statuses[skill.id].needsReview">Рекомендуется повторить.</p>
      <RouterLink
        v-if="statuses[skill.id].readyForStand && standLinks[skill.id]"
        class="button secondary"
        :to="standLinks[skill.id]!"
        >Продолжить на стенде</RouterLink
      >
      <button
        class="button secondary"
        @click="openCourse(workshopCourses.find((c) => c.skill === skill.id)!.id)"
      >
        Изучить тему
      </button>
    </article>
  </div>
  <section class="panel feature-section">
    <h3>Последние самостоятельные попытки</h3>
    <p v-if="!store.state.attempts.length">
      Пройдите терминальную лабораторию. Здесь появятся режим, вариант и результат.
    </p>
    <ol>
      <li v-for="(a, i) in [...store.state.attempts].reverse().slice(0, 15)" :key="i">
        {{ a.id }} · {{ a.mode }} · вариант {{ a.seed }} · {{ a.score }}/100 · подсказок
        {{ a.hints }} · {{ new Date(a.at).toLocaleString('ru-RU') }}
      </li>
    </ol>
  </section>

  <p v-if="notice" role="status">{{ notice }}</p>
</template>
