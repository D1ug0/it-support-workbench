<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkshopStore } from './useWorkshopStore'
import { todayTask } from './learningFlow'
import { professionalAttempts, professionalAttemptSchema } from './professional'
const store = useWorkshopStore()
const incidentId = ref<string>()
onMounted(async () => {
  await store.initialize()
  incidentId.value = (await professionalAttempts.toArray().catch(() => []))
    .flatMap((v) => {
      const parsed = professionalAttemptSchema.safeParse(v)
      return parsed.success && parsed.data.status === 'active' ? [parsed.data] : []
    })
    .sort((a, b) => Date.parse(a.updatedAt ?? a.at) - Date.parse(b.updatedAt ?? b.at))
    .at(-1)?.id
})
const task = computed(() => todayTask(store.state))
</script>
<template>
  <section class="panel feature-section">
    <h2>Продолжить обучение</h2>
    <h3>{{ task.title }}</h3>
    <p>{{ task.reason }}</p>
    <p>
      Сегодня: {{ task.minutes }} мин. Предпосылки: {{ task.prerequisite }}. Результат:
      {{ task.outcome }}.
    </p>
    <div class="button-row">
      <RouterLink class="button primary" :to="task.url">Открыть сегодняшнюю задачу</RouterLink
      ><RouterLink v-if="task.resume" class="button secondary" :to="task.resume"
        >Вернуться к месту в курсе</RouterLink
      ><RouterLink
        v-if="incidentId"
        class="button secondary"
        :to="`/learning?view=workshop&workshop=professional&attempt=${incidentId}`"
        >Продолжить сохранённый инцидент</RouterLink
      >
    </div>
    <details>
      <summary>Единая история обучения ({{ store.state.events.length }})</summary>
      <p>
        Старые результаты остаются в исходных журналах. Новые события связывают модули через ID
        попытки. Отчёт стенда — самостоятельная запись без автоматической аттестации.
      </p>
      <ol>
        <li
          v-for="e in [...store.state.events].reverse().slice(0, 30)"
          :key="`${e.module}:${e.attemptId}`"
        >
          {{ e.module }} · {{ e.taskId }} · {{ e.outcome }} · {{ e.score ?? 'самостоятельный отчёт'
          }}<span v-if="e.skill"> · {{ e.skill }}</span>
          <ul>
            <li v-for="error in e.errors" :key="error">{{ error }}</li>
          </ul>
        </li>
      </ol>
    </details>
  </section>
</template>
