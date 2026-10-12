<script setup lang="ts">
import type { ReportRevision } from '../../domain/reportHistory'
import { explanationReviewMarkdown } from '../../domain/explanationReview'
defineProps<{ history?: ReportRevision[] }>()
</script>
<template>
  <details v-if="history?.length" class="report-revision-history">
    <summary>Предыдущие сохранённые редакции · {{ history.length }} / 3</summary>
    <p>
      Сохраняются три последние предыдущие редакции текста и ручного разбора. Текущая версия
      редактируется отдельно.
    </p>
    <article
      v-for="revision in [...history].reverse()"
      :key="`${revision.version}:${revision.at}`"
      class="workshop-item"
    >
      <h4>Версия {{ revision.version }} · {{ new Date(revision.at).toLocaleString('ru-RU') }}</h4>
      <dl>
        <template
          v-for="(label, key) in {
            symptom: 'Симптом',
            hypothesis: 'Гипотеза',
            evidence: 'Доказательства',
            change: 'Изменение',
            verification: 'Проверка',
            limits: 'Границы вывода',
          }"
          :key="key"
          ><dt>{{ label }}</dt>
          <dd>{{ revision.report[key] || 'Не описано' }}</dd></template
        >
      </dl>
      <details>
        <summary>Ручной разбор этой редакции</summary>
        <pre class="workshop-report-preview" tabindex="0">{{
          explanationReviewMarkdown(revision.review, revision.contentKey)
        }}</pre>
      </details>
    </article>
  </details>
</template>
