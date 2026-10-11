<script setup lang="ts">
import { computed, ref } from 'vue'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import type { TerminalRecord } from './useTerminalStore'
const props = defineProps<{ records: TerminalRecord[]; revision: number; showReview: boolean }>()
const emit = defineEmits<{ analyze: [id: number] }>()
const query = ref(''),
  category = ref('all'),
  state = ref('all')
const visible = computed(() =>
  [...props.records].reverse().filter((record) => {
    const term = query.value.trim().toLowerCase()
    const categoryMatches =
      category.value === 'all' ||
      (category.value === 'observations' && record.observation) ||
      (category.value === 'changes' && record.changed) ||
      (category.value === 'errors' && !record.ok)
    const stateMatches =
      state.value === 'all' ||
      (state.value === 'current'
        ? record.revision === props.revision
        : record.revision < props.revision)
    return (
      categoryMatches &&
      stateMatches &&
      (!term || `${record.id} ${record.command} ${record.output}`.toLowerCase().includes(term))
    )
  }),
)
</script>
<template>
  <section
    id="terminal-records"
    tabindex="-1"
    class="panel feature-section"
    aria-label="Результаты учебных команд"
  >
    <h2>Проверки этой лаборатории</h2>
    <p>
      Последние 40 команд хранятся в памяти. Найдите наблюдение, откройте исходный вывод или
      разберите его анализатором.
    </p>
    <p v-if="!records.length">Начните с help или выберите команду чтения в справочнике.</p>
    <template v-else>
      <label
        >Найти команду, номер или признак в выводе<input
          v-model="query"
          class="text-input"
          type="search"
          maxlength="160"
          placeholder="# команды без знака, DNS, TcpTestSucceeded…"
      /></label>
      <div class="form-grid">
        <label
          >Тип результата<AppSelect v-model="category" class="text-input"
            ><AppSelectOption value="all">Все команды</AppSelectOption
            ><AppSelectOption value="observations">Наблюдения</AppSelectOption
            ><AppSelectOption value="changes">Изменения среды</AppSelectOption
            ><AppSelectOption value="errors">Отклонённые команды</AppSelectOption></AppSelect
          ></label
        >
        <label
          >Состояние среды<AppSelect v-model="state" class="text-input"
            ><AppSelectOption value="all">Все состояния</AppSelectOption
            ><AppSelectOption value="current">Текущее состояние</AppSelectOption
            ><AppSelectOption value="previous">До последнего изменения</AppSelectOption></AppSelect
          ></label
        >
      </div>
      <p role="status">Показано {{ visible.length }} из {{ records.length }} результатов.</p>
      <ul class="terminal-records terminal-results-list">
        <li v-for="record in visible" :key="record.id">
          <strong>#{{ record.id }} </strong><code>{{ record.command }}</code>
          <span class="tag">{{
            record.ok ? `Состояние ${record.revision}` : 'Команда отклонена'
          }}</span>
          <span v-if="record.changed" class="tag">ИЗМЕНЕНИЕ СРЕДЫ</span>
          <span v-else-if="record.observation" class="tag">{{
            record.revision === revision ? 'ТЕКУЩЕЕ НАБЛЮДЕНИЕ' : 'ДО ИЗМЕНЕНИЯ'
          }}</span>
          <button
            v-if="record.kind"
            class="button secondary small"
            @click="emit('analyze', record.id)"
          >
            Разобрать проверку {{ record.id }}
          </button>
          <details>
            <summary>Вывод проверки {{ record.id }}</summary>
            <pre tabindex="0">{{ record.output }}</pre>
          </details>
          <details v-if="record.review && showReview">
            <summary>Разбор действия {{ record.id }}</summary>
            <h3>{{ record.review.title }}</h3>
            <p>{{ record.review.consequence }}</p>
            <p><strong>Следующая проверка:</strong> {{ record.review.next }}</p>
            <p><strong>Закрепление:</strong> {{ record.review.exercise }}</p>
            <RouterLink
              class="text-link"
              :to="`/learning?view=workshop&lesson=${record.review.lesson}`"
              >Изучить связанную тему</RouterLink
            >
          </details>
        </li>
      </ul>
      <p v-if="!visible.length">Совпадений нет. Измените поиск или фильтры.</p>
    </template>
  </section>
</template>
