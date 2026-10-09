<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { FileText, ChevronLeft, ChevronRight, WrapText } from '@lucide/vue'
import type { EvidenceRange } from '../../../domain/types/diagnostic'

const props = defineProps<{ text: string; range?: EvidenceRange }>()
const lines = computed(() => props.text.split('\n'))
const start = ref(1)
const wrap = ref(false)
const viewer = ref<HTMLElement>()
const visible = computed(() =>
  lines.value
    .slice(start.value - 1, start.value + 79)
    .map((text, index) => ({ text, number: start.value + index })),
)
watch(
  () => props.range,
  async (range) => {
    if (range) {
      start.value = Math.max(1, range.startLine - 3)
      await nextTick()
      viewer.value?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      })
      viewer.value?.focus({ preventScroll: true })
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <section ref="viewer" class="panel evidence-viewer" tabindex="-1" aria-label="Исходные строки">
    <div class="panel-heading">
      <div>
        <FileText :size="17" />
        <h2>Доказательства в исходном тексте</h2>
      </div>
      <button
        class="icon-button small"
        aria-label="Перенос строк источника"
        :aria-pressed="wrap"
        @click="wrap = !wrap"
      >
        <WrapText :size="16" />
      </button>
    </div>
    <div class="evidence-notice">
      Исходник может содержать конфиденциальные значения. Он остаётся в памяти вкладки.
    </div>
    <div
      class="source-lines"
      :class="{ wrap }"
      data-testid="source-lines"
      tabindex="0"
      role="region"
      aria-label="Прокручиваемый исходный вывод"
    >
      <div
        v-for="line in visible"
        :key="line.number"
        class="source-line"
        :class="{
          highlighted: range && line.number >= range.startLine && line.number <= range.endLine,
        }"
        :data-line="line.number"
      >
        <span class="line-number">{{ line.number }}</span
        ><code>{{ line.text || ' ' }}</code>
      </div>
    </div>
    <div class="source-pagination">
      <span>Строки {{ start }}–{{ Math.min(start + 79, lines.length) }} из {{ lines.length }}</span>
      <div>
        <button
          class="icon-button small"
          aria-label="Предыдущие строки"
          :disabled="start <= 1"
          @click="start = Math.max(1, start - 80)"
        >
          <ChevronLeft :size="17" /></button
        ><button
          class="icon-button small"
          aria-label="Следующие строки"
          :disabled="start + 79 >= lines.length"
          @click="start += 80"
        >
          <ChevronRight :size="17" />
        </button>
      </div>
    </div>
  </section>
</template>
