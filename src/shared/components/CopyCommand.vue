<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Copy, Check } from '@lucide/vue'
const props = defineProps<{ command: string; shell?: 'CMD' | 'PowerShell' }>()
const shell = computed(
  () =>
    props.shell ?? (/^(?:Get-|Test-|Resolve-)/i.test(props.command.trim()) ? 'PowerShell' : 'CMD'),
)
const copied = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => globalThis.clearTimeout(timer))
async function copy(command: string) {
  globalThis.clearTimeout(timer)
  copied.value = false
  error.value = ''
  try {
    await navigator.clipboard.writeText(command)
    copied.value = true
    timer = setTimeout(() => (copied.value = false), 1800)
  } catch {
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
