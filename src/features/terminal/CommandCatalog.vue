<script setup lang="ts">
import { computed, ref } from 'vue'
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import type { CommandDefinition } from './commandRegistry'
const props = defineProps<{ commands: CommandDefinition[]; disabled: boolean }>()
const emit = defineEmits<{ insert: [command: string] }>()
const search = ref(''),
  effect = ref('all'),
  platform = ref('all')
const targetLabels = { client: 'клиент', server: 'сервер', model: 'модель' }
const filtered = computed(() => {
  const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return props.commands.filter((command) => {
    const haystack =
      `${command.example} ${command.description} ${command.platform} ${targetLabels[command.target]}`.toLowerCase()
    return (
      terms.every((term) => haystack.includes(term)) &&
      (effect.value === 'all' || command.effect === effect.value) &&
      (platform.value === 'all' ||
        (platform.value === 'Windows'
          ? command.platform.includes('Windows') || command.platform === 'PowerShell 7'
          : command.platform === platform.value))
    )
  })
})
</script>
<template>
  <details class="panel terminal-command-catalog">
    <summary>Справочник команд · {{ commands.length }} форм</summary>
    <p>Найдите нужную проверку и вставьте её в строку. Перед запуском можно изменить параметры.</p>
    <label
      >Поиск команды или задачи<input
        v-model="search"
        class="text-input"
        type="search"
        maxlength="160"
        placeholder="DNS, служба, маршрут, curl…"
    /></label>
    <div class="form-grid">
      <label
        >Действие<AppSelect v-model="effect" class="text-input"
          ><AppSelectOption value="all">Все действия</AppSelectOption
          ><AppSelectOption value="read">Чтение и диагностика</AppSelectOption
          ><AppSelectOption value="change">Изменение модели</AppSelectOption></AppSelect
        ></label
      >
      <label
        >Платформа<AppSelect v-model="platform" class="text-input"
          ><AppSelectOption value="all">Все платформы модели</AppSelectOption
          ><AppSelectOption value="Windows">Windows и PowerShell</AppSelectOption
          ><AppSelectOption value="Linux">Linux</AppSelectOption
          ><AppSelectOption value="Модель">Учебные команды</AppSelectOption></AppSelect
        ></label
      >
    </div>
    <p role="status">Найдено: {{ filtered.length }} из {{ commands.length }}.</p>
    <ul class="terminal-command-list">
      <li v-for="command in filtered" :key="command.example">
        <button
          class="button secondary"
          :disabled="disabled"
          @click="emit('insert', command.example)"
        >
          <code>{{ command.example }}</code
          ><span>{{ command.description }}</span>
        </button>
        <p>
          <span class="tag">{{ command.effect === 'change' ? 'Изменяет модель' : 'Чтение' }}</span>
          {{ command.platform }} · {{ targetLabels[command.target] }} ·
          {{
            command.rights === 'administrator'
              ? 'в ОС нужны права на изменение'
              : 'в пределах доступных прав'
          }}
        </p>
      </li>
    </ul>
    <p v-if="!filtered.length">Команд по этим условиям нет. Измените поиск или фильтры.</p>
  </details>
</template>
