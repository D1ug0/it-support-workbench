<script setup lang="ts">
import { computed } from 'vue'
import { terminalLabs } from './catalog'
import { useTerminalStore } from './useTerminalStore'
import { useTerminalCheckpoint } from './useTerminalCheckpoint'
import type { Checkpoint } from './checkpoint'
const props = defineProps<{ resetKey: number; checkpointId?: string }>()
const emit = defineEmits<{ restore: [checkpoint: Checkpoint] }>()
const store = useTerminalStore()
const { pending, consent, busy, error, notice, local, read, exportCheckpoint } =
  useTerminalCheckpoint({
    snapshot: () => store.checkpoint(),
    scope: () => `${store.attemptId}:${store.lab.id}:${props.resetKey}`,
    selectedId: () => props.checkpointId,
  })
const title = computed(() => {
  const value = pending.value
  if (!value) return ''
  return (
    ('network' in value.environment ? value.environment.network?.definition.title : undefined) ??
    terminalLabs.find((lab) => lab.id === value.environment.labId)?.title ??
    value.environment.labId
  )
})
</script>
<template>
  <section class="panel feature-section">
    <h2>Контрольная точка учебной среды</h2>
    <p>
      Можно сохранить состояние сети, DNS, кэша, проверок и попытки. История введённых команд и
      вывод не сохраняются. По одной точке на лабораторию, всего до 50 точек; автоматической записи
      нет.
    </p>
    <label class="checkbox-label"
      ><input v-model="consent" type="checkbox" />Подтверждаю сохранение состояния учебной среды на
      этом устройстве</label
    >
    <div class="button-row">
      <button class="button secondary" :disabled="busy" @click="local('save')">
        Сохранить контрольную точку
      </button>
      <button class="button secondary" :disabled="busy" @click="local('load')">
        Загрузить контрольную точку
      </button>
      <button class="button ghost" :disabled="busy" @click="local('delete')">
        Удалить контрольную точку
      </button>
      <button class="button secondary" @click="exportCheckpoint">
        Скачать контрольную точку JSON
      </button>
    </div>
    <label
      >Импорт контрольной точки<input
        type="file"
        accept=".json,application/json"
        :disabled="busy"
        @change="read"
    /></label>
    <p v-if="busy" role="status">Обрабатываем контрольную точку…</p>
    <div v-if="pending" class="terminal-checkpoint-preview">
      <p>
        Лаборатория: {{ title }} · DNS {{ pending.environment.dns }} · состояние
        {{ pending.environment.revision }} · {{ pending.finished ? 'завершена' : 'в процессе' }} ·
        режим
        {{
          { guided: 'обучение', practice: 'практика', exam: 'проверочная работа' }[pending.mode]
        }}.
      </p>
      <p>Восстановление заменит текущую учебную попытку и очистит её историю команд.</p>
      <button class="button primary" @click="emit('restore', pending)">
        Восстановить учебную среду
      </button>
      <button class="button ghost" @click="pending = undefined">Отмена восстановления</button>
    </div>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
