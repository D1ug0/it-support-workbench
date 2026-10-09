<script setup lang="ts">
import { ref } from 'vue'
import { CircleAlert, Info, ChevronDown, ArrowRight, Quote, Copy, Check } from '@lucide/vue'
import type { DiagnosticFinding, EvidenceRange } from '../../../domain/types/diagnostic'

defineProps<{ finding: DiagnosticFinding; adapterLabel?: string }>()
defineEmits<{ evidence: [range: EvidenceRange] }>()
const expanded = ref(false)
const copied = ref('')
const copyError = ref('')
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => (copied.value = ''), 1800)
  } catch {
    copyError.value = 'Не удалось скопировать. Выделите команду вручную.'
  }
}
</script>

<template>
  <article class="finding-card" :class="finding.severity">
    <div class="finding-top">
      <span class="finding-icon"
        ><CircleAlert v-if="finding.severity === 'warning'" :size="18" /><Info v-else :size="18"
      /></span>
      <div>
        <div class="finding-meta">
          <span>{{ finding.ruleId }}</span
          ><span
            >Уверенность в признаке:
            {{
              finding.confidence === 'high'
                ? 'высокая'
                : finding.confidence === 'medium'
                  ? 'средняя'
                  : 'низкая'
            }}</span
          >
        </div>
        <h3>{{ finding.title }}</h3>
        <span v-if="adapterLabel" class="finding-adapter">{{ adapterLabel }}</span>
      </div>
      <button
        class="icon-button small"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? 'Скрыть' : 'Раскрыть'}: ${finding.title}`"
        @click="expanded = !expanded"
      >
        <ChevronDown :size="18" :class="{ rotated: expanded }" />
      </button>
    </div>
    <p>{{ finding.explanation }}</p>
    <div class="finding-limit">
      <strong>Граница вывода:</strong> {{ finding.whatItDoesNotProve }}
    </div>
    <div class="evidence-links">
      <Quote :size="13" /><button
        v-for="(evidence, index) in finding.evidence"
        :key="index"
        @click="$emit('evidence', evidence.range)"
      >
        {{
          evidence.range.startLine === evidence.range.endLine
            ? `Строка ${evidence.range.startLine}`
            : `Строки ${evidence.range.startLine}–${evidence.range.endLine}`
        }}
      </button>
    </div>
    <div v-if="expanded" class="finding-detail">
      <strong class="next-checks-title">Что проверить дальше</strong>
      <div v-for="(step, index) in finding.nextChecks" :key="index" class="next-check">
        <ArrowRight :size="14" />
        <div>
          <strong>{{ step.label }}</strong>
          <p>{{ step.why }}</p>
          <button
            v-if="step.safeReadOnlyCommand"
            class="copy-command"
            @click="copy(step.safeReadOnlyCommand)"
          >
            <code>{{ step.safeReadOnlyCommand }}</code
            ><Check v-if="copied === step.safeReadOnlyCommand" :size="13" /><Copy
              v-else
              :size="13"
            />
          </button>
        </div>
      </div>
      <p v-if="copyError" role="status">{{ copyError }}</p>
    </div>
    <button class="finding-expand" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? 'Свернуть' : 'Ограничения и следующие проверки' }}
      <ChevronDown :size="13" :class="{ rotated: expanded }" />
    </button>
  </article>
</template>
