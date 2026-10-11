import { onMounted, onBeforeUnmount, ref } from 'vue'

/** Refresh due tasks on a long-lived screen and clean up its timer on navigation. */
export function useLearningClock() {
  const now = ref(Date.now())
  let timer: ReturnType<typeof globalThis.setInterval> | undefined
  onMounted(() => {
    now.value = Date.now()
    timer = globalThis.setInterval(() => (now.value = Date.now()), 60_000)
  })
  onBeforeUnmount(() => globalThis.clearInterval(timer))
  return now
}
