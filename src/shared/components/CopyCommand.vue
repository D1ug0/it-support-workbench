<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Copy, Check } from '@lucide/vue'
const props = defineProps<{ command: string; shell?: 'CMD' | 'PowerShell' }>()
const shell = computed(
  () =>
    props.shell ?? (/^(?:Get-|Test-|Resolve-)/i.test(props.command.trim()) ? 'PowerShell' : 'CMD'),
)
const copied = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let attempt = 0
function resetFeedback() {
  attempt++
  globalThis.clearTimeout(timer)
  timer = undefined
  copied.value = false
  error.value = ''
  return attempt
}
watch(() => props.command, resetFeedback, { flush: 'sync' })
onBeforeUnmount(resetFeedback)
async function copy(command: string) {
  const currentAttempt = resetFeedback()
  try {
    await navigator.clipboard.writeText(command)
    if (currentAttempt !== attempt) return
    copied.value = true
    timer = setTimeout(() => {
      copied.value = false
      timer = undefined
    }, 1800)
  } catch {
    if (currentAttempt === attempt)
      error.value = 'Не удалось скопировать. Выделите команду вручную.'
  }
}
</script>
<template>
  <div class="command-inline">
    <span class="command-shell">{{ shell }}</span>
    <code>{{ command }}</code
    ><button
      class="button secondary small"
      :aria-label="`Скопировать команду ${command}`"
      @click="copy(command)"
    >
      <Check v-if="copied" :size="14" /><Copy v-else :size="14" />{{
        copied ? 'Скопировано' : 'Копировать'
      }}
    </button>
  </div>
  <p role="status" aria-atomic="true" :class="error ? 'form-error' : 'sr-only'">
    {{ error || (copied ? 'Команда скопирована в буфер обмена.' : '') }}
  </p>
</template>
