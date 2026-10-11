<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { formatDifference } from '../sessions/session'
import { downloadText } from '../../infrastructure/export/exportReport'
import type { TerminalRecord } from './useTerminalStore'
import { useTerminalComparison } from './useTerminalComparison'
const props = defineProps<{ records: TerminalRecord[]; revision: number }>()
const {
  beforeId,
  afterId,
  entries,
  before,
  after,
  afterOptions,
  comparison,
  suggested,
  selectSuggested,
} = useTerminalComparison(() => props.records)
function exportComparison() {
  if (!before.value || !after.value || comparison.value.error) return
  downloadText(
    [
      '# Сравнение учебных проверок',
      'Синтетические данные виртуального терминала.',
      `До: #${before.value.record.id} · состояние ${before.value.record.revision} · ${before.value.record.command}`,
      `После: #${after.value.record.id} · состояние ${after.value.record.revision} · ${after.value.record.command}`,
      ...(comparison.value.contextChanged
        ? ['Команды или параметры различаются; это не изолированная проверка эффекта изменения.']
        : []),
      ...comparison.value.values.map(
        (value) =>
          `${value.scope} · ${value.field}\nДо: ${formatDifference(value.before, undefined, true)}\nПосле: ${formatDifference(value.after, undefined, true)}`,
      ),
      ...(comparison.value.values.length
        ? []
        : ['Различий в поддерживаемых структурированных полях нет.']),
      'Сравнение показывает изменение полей, а не доказанную причину. Исходный вывод не включён; полнота проверки сервиса оценивается отдельно.',
    ].join('\n\n'),
    'workbench-terminal-comparison.md',
  )
}
</script>
<template>
  <section
    v-if="entries.length >= 2"
    id="terminal-comparison"
    class="panel feature-section"
    tabindex="-1"
  >
    <h2>Сравнить учебные проверки до и после</h2>
    <p>
      Выберите две проверки одного формата. Автоподбор ищет повтор одинаковой команды в более
      позднем состоянии среды.
    </p>
    <p class="terminal-origin">
      В список входят только результаты, разобранные поддерживаемым парсером. Остальные доступны в
      истории команд.
    </p>
    <button class="button secondary" :disabled="!suggested" @click="selectSuggested">
      Подобрать последний повтор после изменения
    </button>
    <p v-if="!suggested" class="terminal-origin">
      Пары с одинаковой командой и разными состояниями пока нет. Её можно получить, повторив
      диагностическую команду после изменения.
    </p>
    <div class="form-grid">
      <label
        >Учебная проверка до<AppSelect
          v-model="beforeId"
          class="text-input"
          aria-label="Учебная проверка до"
        >
          <AppSelectOption value="">Выберите проверку</AppSelectOption>
          <AppSelectOption v-for="entry in entries" :key="entry.key" :value="entry.key"
            >{{ entry.record.id }} · {{ entry.record.command }} · состояние
            {{ entry.record.revision }}</AppSelectOption
          >
        </AppSelect></label
      >
      <label
        >Учебная проверка после<AppSelect
          v-model="afterId"
          class="text-input"
          aria-label="Учебная проверка после"
          :disabled="!before"
        >
          <AppSelectOption value="">Выберите более позднюю проверку</AppSelectOption>
          <AppSelectOption v-for="entry in afterOptions" :key="entry.key" :value="entry.key"
            >{{ entry.record.id }} · {{ entry.record.command }} · состояние
            {{ entry.record.revision }}</AppSelectOption
          >
        </AppSelect></label
      >
    </div>
    <p v-if="comparison.error" role="status">{{ comparison.error }}</p>
    <template v-if="before && after && !comparison.error">
      <p v-if="comparison.contextChanged" class="terminal-hint">
        Команды или параметры различаются. Сопоставьте цель, порт, сервер и тип запроса: разница
        может быть вызвана контекстом проверки.
      </p>
      <p v-if="after.record.revision !== revision">
        Проверка «после» относится к состоянию {{ after.record.revision }}. Текущее состояние —
        {{ revision }}; для него нужна новая проверка.
      </p>
      <p v-if="before.record.revision === after.record.revision">
        Обе проверки сделаны в одном состоянии среды. Между ними не зафиксировано изменение
        конфигурации.
      </p>
      <ul class="diff-list">
        <li v-for="(difference, index) in comparison.values" :key="index">
          <strong>{{ difference.scope }} · {{ difference.field }}</strong>
          <p>До: {{ formatDifference(difference.before, undefined, true) }}</p>
          <p>После: {{ formatDifference(difference.after, undefined, true) }}</p>
        </li>
      </ul>
      <p v-if="!comparison.values.length">Различий в поддерживаемых структурированных полях нет.</p>
      <p class="terminal-origin">
        Сравнение полей не устанавливает причину изменения и не заменяет проверку целевого сервиса.
      </p>
      <button class="button ghost" @click="exportComparison">Скачать сравнение Markdown</button>
    </template>
  </section>
</template>
