<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight } from '@lucide/vue'
import type { AnalysisResult, EvidenceRange } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
import { explainResult } from '../application/explainResult'
import CopyCommand from '../../../shared/components/CopyCommand.vue'
const props = defineProps<{ result: AnalysisResult<ParsedOutput> }>()
defineEmits<{ evidence: [range: EvidenceRange] }>()
const summary = computed(() => explainResult(props.result))
</script>
<template>
  <section class="panel plain-summary" aria-labelledby="plain-summary-title">
    <span class="eyebrow">ПОНЯТНЫЙ РАЗБОР</span>
    <h2 id="plain-summary-title">Коротко о результате</h2>
    <p class="plain-headline">{{ summary.headline }}</p>
    <p v-if="result.parse.status === 'partial'" class="plain-incomplete">
      Разобрана только часть текста. Не найденное поле могло отсутствовать в переданном фрагменте.
    </p>
    <div v-for="fact in summary.facts" :key="fact.label" class="plain-fact">
      <h3>{{ fact.label }}</h3>
      <p>{{ fact.text }}</p>
      <button v-if="fact.range" class="text-link" @click="$emit('evidence', fact.range)">
        Где это видно в исходнике
      </button>
    </div>
    <div class="plain-next">
      <span class="eyebrow">СЛЕДУЮЩИЙ ШАГ</span>
      <h3>{{ summary.next.label }}</h3>
      <p>{{ summary.next.why }}</p>
      <CopyCommand v-if="summary.next.command" :command="summary.next.command" />
    </div>
    <p class="plain-limit">{{ summary.limitation }}</p>
    <div class="button-row">
      <RouterLink class="text-link" to="/guide"
        >Выбрать порядок проверки по симптому <ArrowRight :size="14" /></RouterLink
      ><RouterLink v-if="result.parse.kind === 'route'" class="text-link" to="/toolkit"
        >Посмотреть выбор маршрута</RouterLink
      >
    </div>
  </section>
</template>
