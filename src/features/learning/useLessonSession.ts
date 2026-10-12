import { ref, watch, onBeforeUnmount, type ComputedRef } from 'vue'
import type { WorkshopCourse } from '../workshop/index'
import { useWorkshopStore } from '../workshop/model/index'
import { taskErrorIds } from '../workshop/index'
import { saveNotice } from '../../shared/persistence'

/** First response belongs to one lesson session; late saves never change the next screen. */
export function useLessonSession(course: ComputedRef<WorkshopCourse>) {
  const store = useWorkshopStore()
  const selected = ref<number>()
  const answer = ref<number>()
  const busy = ref(false)
  const notice = ref('')
  let generation = 0
  watch(
    () => course.value.id,
    () => {
      generation++
      selected.value = undefined
      answer.value = undefined
      notice.value = ''
    },
  )
  onBeforeUnmount(() => generation++)
  async function markRead() {
    if (busy.value || !store.ready) return
    const ticket = generation,
      id = course.value.id
    busy.value = true
    try {
      const result = await store.markRead(id)
      if (ticket === generation)
        notice.value = saveNotice(result, 'Материал отмечен. Теперь проверьте понимание.')
    } finally {
      busy.value = false
    }
  }
  async function submit() {
    if (busy.value || !store.ready || answer.value !== undefined || selected.value === undefined)
      return
    const ticket = generation,
      current = course.value,
      index = selected.value
    const at = new Date().toISOString(),
      correct = index === current.correct
    answer.value = index
    busy.value = true
    try {
      const result = await store.recordResult({
        theory: { taskId: current.id, skill: current.skill, form: 'choice', correct, at },
        assessment: correct,
        event: {
          attemptId: globalThis.crypto.randomUUID(),
          module: 'course',
          taskId: current.id,
          skill: current.skill,
          at,
          score: correct ? 100 : 0,
          outcome: correct ? 'completed' : 'failed',
          errors: correct ? [] : [current.why.slice(0, 180)],
          errorIds: correct ? [] : taskErrorIds('course', current.id),
        },
      })
      if (ticket === generation)
        notice.value = saveNotice(result, 'Первая попытка записана в учебный журнал.')
    } finally {
      busy.value = false
    }
  }
  return { selected, answer, busy, notice, markRead, submit }
}
