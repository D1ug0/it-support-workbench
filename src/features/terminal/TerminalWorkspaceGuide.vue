<script setup lang="ts">
import { computed } from 'vue'
import type { TerminalRecord } from './useTerminalStore'
import type { TerminalMode } from './checkpoint'
const props = defineProps<{
  mode: TerminalMode
  records: TerminalRecord[]
  revision: number
  verifiedRevision: number | null
  finished: boolean
}>()
const observations = computed(() => props.records.filter((record) => record.observation))
const latestChange = computed(() => [...props.records].reverse().find((record) => record.changed))
const current = computed(() =>
  observations.value.filter((record) => record.revision === props.revision),
)
const freshVerification = computed(() => props.verifiedRevision === props.revision)
const next = computed(() => {
  if (props.finished)
    return 'Оформите вывод: причина, доказательства, повторная проверка и границы результата. Затем разберите объяснение по рубрике.'
  if (!observations.value.length)
    return 'Начните с наблюдения. Уточните, что именно не работает, и выберите команду чтения в справочнике.'
  if (latestChange.value && !current.value.length)
    return 'Среда изменилась. Снимите новый результат и повторите пользовательский сценарий: прежние проверки относятся к предыдущему состоянию.'
  if (!freshVerification.value)
    return 'Сопоставьте наблюдения с гипотезой. Выберите проверку, которая отличит её от другой возможной причины. Изменяйте только то, для чего есть основания.'
  return 'Целевая проверка модели актуальна. Сопоставьте её с исходным симптомом, объясните причину и обозначьте, что ещё не было проверено.'
})
</script>
<template>
  <section class="panel terminal-workspace-guide" aria-label="Ориентиры расследования">
    <div class="button-row">
      <h2>Рабочее место расследования</h2>
      <span class="tag">Состояние {{ revision }}</span>
    </div>
    <div class="terminal-workspace-stats">
      <p>
        <strong>{{ observations.length }}</strong
        ><span>наблюдений в истории</span>
      </p>
      <p>
        <strong>{{ current.length }}</strong
        ><span>в текущем состоянии</span>
      </p>
      <p>
        <strong>{{ freshVerification ? 'Актуальна' : 'Ожидается' }}</strong
        ><span>целевая проверка модели</span>
      </p>
    </div>
    <p v-if="latestChange && !freshVerification" class="terminal-hint">
      Последнее изменение — команда #{{ latestChange.id }}. Повторите проверку после него.
    </p>
    <template v-if="mode === 'guided'">
      <p>{{ next }}</p>
      <details>
        <summary>Как строить расследование</summary>
        <ol>
          <li>Опишите симптом и масштаб: кто, где и какое действие не может выполнить.</li>
          <li>Снимите исходное состояние и отделите факты из вывода от предположений.</li>
          <li>Сравните гипотезы. Выберите проверку, способную опровергнуть вашу версию.</li>
          <li>Сделайте минимальное обоснованное изменение или объясните, почему оно не нужно.</li>
          <li>Повторите целевой сценарий, свяжите отчёт с проверками и укажите ограничения.</li>
        </ol>
      </details>
    </template>
    <p v-else>
      Ведите расследование самостоятельно. История сохраняет состояние каждой команды; успешное
      выполнение команды само по себе не подтверждает исправление.
    </p>
    <p class="muted">
      Здесь показаны состояния и результаты команд. Вывод о причине формулируете вы.
    </p>
  </section>
</template>
