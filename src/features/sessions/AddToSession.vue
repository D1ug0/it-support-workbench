<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AnalysisResult } from '../../domain/types/diagnostic'
import type { ParsedOutput } from '../../domain/types/outputs'
import { useSessionStore } from './useSessionStore'
const props = defineProps<{ analysis: AnalysisResult<ParsedOutput>; source: string }>()
const session = useSessionStore()
const label = ref('')
const date = new Date()
const observedAt = ref(
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
)
const error = ref('')
const added = ref(false)
const timezone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
function add() {
  try {
    session.add(props.analysis, props.source, label.value, new Date(observedAt.value).toISOString())
    added.value = true
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось добавить проверку.'
  }
}
</script>
<template>
  <details class="panel session-add">
    <summary>Добавить эту проверку в рабочую сессию</summary>
    <div v-if="!session.active">
      <p>
        Создайте сессию и подтвердите общий контекст устройства. Все её источники останутся в памяти
        вкладки.
      </p>
      <RouterLink class="button secondary small" to="/sessions">Создать рабочую сессию</RouterLink>
    </div>
    <p v-else-if="session.restored">
      Открыт обезличенный архив. Для новых измерений очистите его и создайте новую рабочую сессию в
      разделе «Рабочие сессии».
    </p>
    <div v-else>
      <p>{{ session.title }} · {{ session.context }}</p>
      <div class="form-grid">
        <label
          >Метка проверки<input
            v-model="label"
            maxlength="100"
            class="text-input"
            placeholder="До VPN / после VPN" /></label
        ><label
          >Время проверки<input v-model="observedAt" class="text-input" type="datetime-local"
        /></label>
      </div>
      <small
        >Часовой пояс: {{ timezone }}. Укажите время выполнения команды, а не только время
        загрузки.</small
      >
      <button class="button secondary small" :disabled="added" @click="add">
        {{ added ? 'Проверка добавлена' : 'Добавить в сессию' }}
      </button>
      <RouterLink v-if="added" to="/sessions">Открыть сессию</RouterLink>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    </div>
  </details>
</template>
