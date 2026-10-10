import { computed, onBeforeUnmount, ref } from 'vue'
const forms = new Map<symbol, () => boolean>()
export function confirmDiscardForms() {
  return (
    ![...forms.values()].some((dirty) => dirty()) ||
    window.confirm(
      'Есть несохранённые учебные заметки. Уйти и потерять изменения? Сначала можно сохранить черновик или экспортировать его.',
    )
  )
}
export function useUnsavedChanges(snapshot: () => string) {
  const saved = ref(snapshot())
  const dirty = computed(() => snapshot() !== saved.value)
  const key = Symbol('form')
  forms.set(key, () => snapshot() !== saved.value)
  const unload = (event: BeforeUnloadEvent) => {
    if (snapshot() !== saved.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', unload)
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
