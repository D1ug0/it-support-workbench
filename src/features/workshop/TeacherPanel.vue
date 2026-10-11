<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { parseWorkshopProgress, buildSkillStatuses, skills, type WorkshopProgress } from './skills'
import { downloadText } from '../../infrastructure/export/exportReport'
const learners = ref<Array<{ alias: string; state: WorkshopProgress }>>([]),
  error = ref(''),
  busy = ref(false)
const statuses = computed(() => learners.value.map((l) => buildSkillStatuses(l.state)))
let generation = 0
onBeforeUnmount(() => generation++)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    files = [...(input.files ?? [])],
    ticket = ++generation
  busy.value = true
  error.value = ''
  try {
    if (!files.length) return
    if (files.length + learners.value.length > 20)
      throw new Error('Лимит: 20 учеников в текущем сравнении.')
    const used = new globalThis.TextEncoder().encode(JSON.stringify(learners.value)).length
    if (used + files.reduce((total, file) => total + file.size, 0) > 16 * 1024 * 1024)
      throw new Error('Общий предел сравнения: 16 MiB. Уберите часть учеников.')
    const values: WorkshopProgress[] = []
    for (const file of files) {
      if (file.size > 12 * 1024 * 1024) throw new Error('Каждый файл: до 12 MiB.')
      values.push(parseWorkshopProgress(await file.text()))
    }
    if (ticket === generation)
      learners.value = [
        ...learners.value,
        ...values.map((state, i) => ({ alias: `Ученик ${learners.value.length + i + 1}`, state })),
      ]
  } catch (e) {
    if (ticket === generation) error.value = e instanceof Error ? e.message : 'Ошибка пакета.'
  } finally {
    input.value = ''
    if (ticket === generation) busy.value = false
  }
}
function exportOverview() {
  downloadText(
    [
      '# Учебная группа',
      'Данные представлены учениками и не подтверждают независимую аттестацию.',
      ...learners.value.map(
        (l, i) =>
          `## ${l.alias}\n${skills.map((s) => `- ${s.title}: ${statuses.value[i]![s.id].level}; попыток ${statuses.value[i]![s.id].attempts}; ${statuses.value[i]![s.id].needsReview ? 'назначить повторение' : 'без назначенного повторения'}`).join('\n')}`,
      ),
    ].join('\n\n'),
    'workbench-group-overview.md',
  )
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Сравнить учебные результаты группы</h3>
    <p>
      Откройте экспорт прогресса практикума нескольких учеников. Сравнение остаётся в памяти до
      ухода из раздела, не заменяет ваши результаты и не отправляется в companion. Имена файлов не
      показываются; псевдонимы можно изменить. До 20 файлов, каждый до 12 MiB, вместе до 16 MiB.
      Оценки редактируемы авторами: проверяйте отчёты и самостоятельный вариант.
    </p>
    <label
      >Открыть прогресс учеников<input
        type="file"
        multiple
        accept=".json,application/json"
        :disabled="busy"
        @change="read"
    /></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="button-row">
      <button class="button secondary" :disabled="!learners.length" @click="exportOverview">
        Экспорт обзора группы</button
      ><button class="button ghost" :disabled="!learners.length" @click="learners = []">
        Очистить сравнение группы из памяти
      </button>
    </div>
    <article v-for="(learner, i) in learners" :key="i" class="workshop-item">
      <label
        >Учебный псевдоним<input v-model="learner.alias" class="text-input" maxlength="80"
      /></label>
      <ul>
        <li v-for="skill in skills" :key="skill.id">
          {{ skill.title }}: {{ statuses[i]![skill.id].level }} ·
          {{ statuses[i]![skill.id].needsReview ? 'повторить' : 'плановая практика' }}
        </li>
      </ul>
      <button class="button ghost" @click="learners.splice(i, 1)">
        Убрать ученика из сравнения
      </button>
    </article>
  </section>
</template>
