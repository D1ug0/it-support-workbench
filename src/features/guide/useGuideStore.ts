import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { GuidePlan, ScopeId, SymptomId } from './catalog'

export const useGuideStore = defineStore('guide', () => {
  const selected = ref<SymptomId>()
  const scope = ref<ScopeId>()
  const detail = ref('')
  const plan = shallowRef<GuidePlan>()
  const done = ref<string[]>([])
  function clear() {
    selected.value = undefined
    scope.value = undefined
    detail.value = ''
    plan.value = undefined
    done.value = []
  }
  return { selected, scope, detail, plan, done, clear }
})
