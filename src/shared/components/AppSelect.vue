<script setup lang="ts" generic="T extends string | number | null = string">
import { ChevronDown } from '@lucide/vue'
import {
  SelectContent,
  SelectIcon,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed, ref } from 'vue'
import { decodeSelectValue, encodeSelectValue } from './selectValue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  modelValue?: T
  disabled?: boolean
  placeholder?: string
  name?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: T]; change: [value: T] }>()
const local = ref<string | number | null>('')
const trigger = ref<InstanceType<typeof SelectTrigger>>()
const portalTarget = ref<HTMLElement>()
function locatePortal(open: boolean) {
  if (!open) return
  const element: unknown = trigger.value?.$el
  // A native dialog lives in the browser top layer; its menu must stay inside it.
  portalTarget.value =
    element instanceof HTMLElement ? (element.closest('dialog[open]') ?? undefined) : undefined
}
const current = computed(() => (props.modelValue === undefined ? local.value : props.modelValue))
const encoded = computed(() => encodeSelectValue(current.value))
function update(value: unknown) {
  if (typeof value !== 'string') return
  const decoded = decodeSelectValue(value) as T
  local.value = decoded
  emit('update:modelValue', decoded)
  emit('change', decoded)
}
</script>
<template>
  <SelectRoot
    :model-value="encoded"
    :disabled="disabled"
    :name="name"
    @update:model-value="update"
    @update:open="locatePortal"
  >
    <SelectTrigger
      ref="trigger"
      v-bind="$attrs"
      type="button"
      class="app-select-trigger"
      :data-value="current"
    >
      <span class="app-select-value"
        ><SelectValue :placeholder="placeholder ?? 'Выберите вариант'"
      /></span>
      <SelectIcon class="app-select-chevron"
        ><ChevronDown :size="17" aria-hidden="true"
      /></SelectIcon>
    </SelectTrigger>
    <SelectPortal :to="portalTarget">
      <SelectContent
        class="app-select-content"
        position="popper"
        align="start"
        :side-offset="6"
        :collision-padding="12"
      >
        <SelectViewport
          class="app-select-viewport"
          role="group"
          aria-label="Варианты выбора"
          tabindex="0"
          ><slot
        /></SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
