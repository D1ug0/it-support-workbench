<script setup lang="ts">
import { Check } from '@lucide/vue'
import { SelectItem, SelectItemText, SelectItemIndicator } from 'reka-ui'
import { encodeSelectValue, type SelectValue } from './selectValue'
defineProps<{ value: SelectValue; disabled?: boolean }>()
</script>
<template>
  <SelectItem
    :value="encodeSelectValue(value)"
    :disabled="disabled"
    :data-value="value"
    class="app-select-option"
  >
    <SelectItemText><slot /></SelectItemText>
    <SelectItemIndicator class="app-select-indicator"
      ><Check :size="16" aria-hidden="true"
    /></SelectItemIndicator>
  </SelectItem>
</template>
