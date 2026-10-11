<script setup lang="ts">
import { computed } from 'vue'
import { contentProvenance } from '../learning/contentProvenance'
const props = defineProps<{
  id: string
  source: string
  authored?: boolean
  prerequisites?: string
}>()
const provenance = computed(() => contentProvenance(props.id, props.source, props.authored))
</script>
<template>
  <details class="workshop-item">
    <summary>Происхождение материала и границы проверки</summary>
    <p>
      Тип:
      {{
        authored ? 'авторский материал, проверка автора' : 'теория и подготовленная учебная модель'
      }}. Версия материала: {{ provenance.version }}.
    </p>
    <p>{{ provenance.platform }}.</p>
    <p>
      <strong>{{
        provenance.review.status === 'reviewed'
          ? `Сверено с источниками ${provenance.review.at}`
          : provenance.review.status === 'author'
            ? 'Проверка автора'
            : 'Ожидает содержательной проверки'
      }}</strong
      >. {{ provenance.review.scope }}
    </p>
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
    <ul>
      <li v-for="reference in provenance.sources" :key="reference.url">
        <a :href="reference.url" target="_blank" rel="noopener noreferrer">{{ reference.title }}</a>
      </li>
    </ul>
    <RouterLink class="text-link" to="/knowledge?formats=1"
      >Матрица поддерживаемых форматов</RouterLink
    >
  </details>
</template>
