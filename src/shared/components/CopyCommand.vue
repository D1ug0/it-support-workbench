<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Copy, Check } from '@lucide/vue'
const props = defineProps<{ command: string }>()
const shell = computed(() => (/^(?:Get-|Test-)/i.test(props.command.trim()) ? 'PowerShell' : 'CMD'))
const copied = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => globalThis.clearTimeout(timer))
async function copy(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    error.value = ''
    copied.value = true
    globalThis.clearTimeout(timer)
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
  <p v-if="error" role="status" class="form-error">{{ error }}</p>
</template>
