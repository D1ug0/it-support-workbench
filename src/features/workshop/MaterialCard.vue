<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  id: string
  source: string
  authored?: boolean
  prerequisites?: string
}>()
const platform = computed(() =>
  ['LINUX', 'SERVICES', 'RECOVERY', 'GIT'].includes(props.id)
    ? 'Linux / macOS / учебный контейнер; версия фиксируется в отчёте стенда'
    : 'Windows / Windows PowerShell; версии и локали RU/EN проверены только синтетически',
)
</script>
<template>
  <details class="workshop-item">
    <summary>Происхождение материала и границы проверки</summary>
    <p>
      Тип:
      {{
        authored ? 'авторский материал, проверка автора' : 'теория и подготовленная учебная модель'
      }}. Проверка содержания кода: 10.10.2026; это не дата подтверждения на реальной ОС.
    </p>
    <p>{{ platform }}.</p>
    <p>
      Предпосылки:
      {{
        prerequisites || 'базовый диагностический процесс; выполняйте связанные задания постепенно'
      }}.
    </p>
    <p>
      Команда в help поддержана симулятором в указанной форме. Настоящие Windows captures пока не
      получены. IPv6, AD/SMB/GPO, TLS и права модели имеют ограниченную семантику; детали
      проверяются на собственной VM.
    </p>
    <a :href="source" target="_blank" rel="noopener noreferrer"
      >Первичный источник, указанный в материале</a
    ><RouterLink class="text-link" to="/knowledge?formats=1"
      >Матрица поддерживаемых форматов</RouterLink
    >
  </details>
</template>
