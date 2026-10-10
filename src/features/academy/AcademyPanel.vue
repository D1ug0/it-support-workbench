<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { academyCourses, academyQuestions } from './catalog'
import { useLearningStore } from '../learning/useLearningStore'
import AcademyLab from './AcademyLab.vue'
import CopyCommand from '../../shared/components/CopyCommand.vue'
const route = useRoute()
const router = useRouter()
const store = useLearningStore()
const query = ref('')
const courses = computed(() =>
  academyCourses.filter((c) =>
    `${c.title} ${c.summary} ${c.goals.join(' ')}`
      .toLowerCase()
      .includes(query.value.trim().toLowerCase()),
  ),
)
const selected = computed(() => academyCourses.find((c) => c.id === route.query.course))
const correctCount = (id: string) =>
  academyCourses
    .find((c) => c.id === id)!
    .lab.questions.filter((q) => store.state.answers[q.id]?.lastCorrect).length
const correct = computed(
  () => academyQuestions.filter((q) => store.state.answers[q.id]?.lastCorrect).length,
)
const prerequisites = (item: (typeof academyCourses)[number]) =>
  item.prerequisites.map((id) => academyCourses.find((c) => c.id === id)!.title).join(', ')
async function open(id: string) {
  await router.push({ path: '/learning', query: { view: 'advanced', course: id } })
  await nextTick()
  document.getElementById('academy-lesson')?.focus()
}
</script>
<template>
  <section class="panel feature-section" aria-labelledby="academy-title">
    <span class="eyebrow">ОТ ОСНОВ К СЛОЖНЫМ ИНЦИДЕНТАМ</span>
    <h2 id="academy-title">Продвинутый курс</h2>
    <p>
      {{ academyCourses.length }} модулей · {{ academyQuestions.length }} практических решений ·
      последних верных ответов: {{ correct }}.
    </p>
    <p>
      Сначала прочитайте объяснение, затем разберите свидетельства и выберите следующую проверку.
      Предпосылки помогают выбрать порядок; все модули доступны сразу.
    </p>
    <label
      >Поиск продвинутой темы<input
        v-model="query"
        class="text-input"
        placeholder="TLS, права доступа, Kerberos, IPv6…"
        type="search"
    /></label>
  </section>
  <div class="academy-grid">
    <article v-for="item in courses" :key="item.id" class="panel feature-section academy-card">
      <span class="tag"
        >{{ item.minutes }} МИН · {{ correctCount(item.id) }} /
        {{ item.lab.questions.length }} РЕШЕНИЙ</span
      >
      <h2>{{ item.title }}</h2>
      <p>{{ item.summary }}</p>
      <p v-if="item.prerequisites.length" class="academy-prerequisites">
        Перед этим: {{ prerequisites(item) }}.
      </p>
      <p v-else class="academy-prerequisites">Перед этим: базовые темы сетей и диагностики.</p>
      <button
        class="button secondary small"
        :aria-pressed="selected?.id === item.id"
        @click="open(item.id)"
      >
        Изучить: {{ item.title }}
      </button>
    </article>
  </div>
  <p v-if="!courses.length" role="status">Тем не найдено. Попробуйте другое слово.</p>
  <template v-if="selected">
    <section
      id="academy-lesson"
      class="panel feature-section academy-lesson"
      tabindex="-1"
      :aria-label="`Урок: ${selected.title}`"
    >
      <span class="eyebrow">ОБЪЯСНЕНИЕ · ПРОВЕРЕНО {{ selected.reviewedAt }}</span>
      <h2>{{ selected.title }}</h2>
      <p>{{ selected.summary }}</p>
      <h3>После модуля вы сможете</h3>
      <ul>
        <li v-for="goal in selected.goals" :key="goal">{{ goal }}</li>
      </ul>
      <article v-for="concept in selected.concepts" :key="concept.title">
        <h3>{{ concept.title }}</h3>
        <p>{{ concept.body }}</p>
      </article>
      <h3>Команды и цель проверки</h3>
      <p>
        Приложение команды не выполняет. Имена и адреса учебные; для ручной проверки используйте
        разрешённый ресурс. PowerShell-выводы этих команд пока не разбираются анализатором.
      </p>
      <div v-for="command in selected.commands" :key="command.command" class="academy-command">
        <CopyCommand :command="command.command" :shell="command.shell" />
        <p>{{ command.purpose }}</p>
      </div>
      <h3>Последовательность диагностики</h3>
      <ol>
        <li v-for="step in selected.checklist" :key="step">{{ step }}</li>
      </ol>
      <p class="finding-limit">Типичная ошибка: {{ selected.pitfall }}</p>
      <h3>Изучить подробнее</h3>
      <ul>
        <li v-for="item in selected.sources" :key="item.url">
          <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
        </li>
      </ul>
      <p>
        Объяснение и лабораторная доступны офлайн после включения офлайн-доступа; внешние источники
        требуют сети.
      </p>
    </section>
    <AcademyLab :key="selected.id" :course="selected" />
  </template>
</template>
