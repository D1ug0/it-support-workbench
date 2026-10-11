import { computed, onBeforeUnmount, onActivated, onDeactivated, ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
type Destination = Pick<RouteLocationNormalized, 'path' | 'query'>
const forms = new Map<
  symbol,
  { dirty: () => boolean; active: boolean; preserved?: (to: Destination) => boolean }
>()
export function confirmDiscardForms(destination?: Destination) {
  return (
    ![...forms.values()].some(
      (form) =>
        form.dirty() &&
        !(destination && form.preserved?.(destination)) &&
        (form.active || !!destination),
    ) ||
    window.confirm(
      'Есть несохранённые изменения. Уйти и потерять изменения? Сначала можно сохранить или экспортировать данные.',
    )
  )
}
export function useUnsavedChanges(
  snapshot: () => string,
  preserved?: (to: Destination) => boolean,
) {
  const saved = ref(snapshot())
  const dirty = computed(() => snapshot() !== saved.value)
  const key = Symbol('form')
  const form = { dirty: () => snapshot() !== saved.value, active: true, preserved }
  forms.set(key, form)
  const unload = (event: BeforeUnloadEvent) => {
    if (snapshot() !== saved.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', unload)
  // KeepAlive retains notes during an internal lesson, but leaving the page still loses them.
  onDeactivated(() => {
    form.active = false
  })
  onActivated(() => {
    form.active = true
  })
  onBeforeUnmount(() => {
    forms.delete(key)
    window.removeEventListener('beforeunload', unload)
  })
  return {
    dirty,
    markSaved: (value = snapshot()) => {
      saved.value = value
    },
  }
}
