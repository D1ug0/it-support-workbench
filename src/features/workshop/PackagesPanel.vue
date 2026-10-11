<script setup lang="ts">
import AppSelect from '../../shared/components/AppSelect.vue'
import AppSelectOption from '../../shared/components/AppSelectOption.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { learningPackages, packageChecks, packageFinals, type PackageCheck } from './packages'
import { useWorkshopStore } from './useWorkshopStore'
import { skills } from './skills'
import { taskErrorIds } from './learningErrors'
const workshop = useWorkshopStore(),
  route = useRoute(),
  router = useRouter()
const selected = ref(learningPackages.find((p) => p.id === route.query.package)?.id ?? 'network')
const values = ref<Record<string, string | number>>({}),
  busy = ref(false),
  notice = ref('')
onMounted(() => workshop.initialize())
watch(
  () => route.query.package,
  (id) => {
    if (learningPackages.some((p) => p.id === id)) selected.value = String(id)
  },
)
const packet = computed(() => learningPackages.find((p) => p.id === selected.value)!)
const checks = computed(() =>
  packageChecks(selected.value).sort(
    (a, b) => Number(b.skill === route.query.skill) - Number(a.skill === route.query.skill),
  ),
)
const final = computed(() => packageFinals[selected.value]!)
function skillTitle(id: unknown) {
  return skills.find((s) => s.id === id)?.title ?? String(id)
}
function taskId(check: PackageCheck) {
  return `PACK-${selected.value}-v2-${check.id}`
}
function result(check: PackageCheck) {
  return workshop.state.theoryChecks.find((c) => c.taskId === taskId(check))
}
function selectPackage() {
  notice.value = ''
  void router.replace({
    path: '/learning',
    query: { view: 'workshop', workshop: 'packages', package: selected.value },
  })
}
async function check(item: PackageCheck, answer: number) {
  if (busy.value || result(item) || !Number.isFinite(answer)) return
  busy.value = true
  const id = taskId(item),
    correct = answer === item.answer
  try {
    const saved = await workshop.recordTheory({
      taskId: id,
      skill: item.skill,
      form: item.form,
      correct,
      at: new Date().toISOString(),
    })
    await workshop.addEvent({
      attemptId: globalThis.crypto.randomUUID(),
      module: 'course',
      taskId: id,
      skill: item.skill,
      at: new Date().toISOString(),
      score: correct ? 100 : 0,
      outcome: correct ? 'completed' : 'failed',
      errors: correct ? [] : [item.prompt],
      errorIds: correct ? [] : taskErrorIds('course', id),
    })
    notice.value =
      saved.status === 'saved'
        ? 'Первый ответ сохранён.'
        : saved.status === 'failed'
          ? saved.error
          : 'Первый ответ в памяти; включите сохранение прогресса для продолжения после перезагрузки.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="panel feature-section">
    <h3>Углублённые тематические пакеты</h3>
    <label
      >Пакет<AppSelect v-model="selected" class="text-input" @change="selectPackage">
        <AppSelectOption v-for="p in learningPackages" :key="p.id" :value="p.id">{{
          p.title
        }}</AppSelectOption>
      </AppSelect></label
    >
    <h4>{{ packet.title }}</h4>
    <p>
      Предпосылки: {{ packet.requires }}. Каждая проверка засчитывается своему навыку. Первый ответ
      фиксируется до показа объяснения; изменение ответа после разбора не повышает оценку этой
      задачи.
    </p>
    <p v-if="route.query.skill">
      Маршрут направил вас на навык {{ skillTitle(route.query.skill) }}: его проверки показаны
      первыми.
    </p>
    <ol>
      <li v-for="s in packet.steps" :key="s">{{ s }}</li>
    </ol>
    <div class="button-row">
      <RouterLink
        v-for="id in packet.lessons"
        :key="id"
        class="button secondary"
        :to="`/learning?view=workshop&lesson=${id}`"
        >Материал {{ id }}</RouterLink
      >
    </div>
    <article v-for="item in checks" :key="item.id" class="workshop-item">
      <h4>
        {{
          item.form === 'choice'
            ? 'Выбор гипотезы'
            : item.form === 'calculation'
              ? 'Расчёт по данным'
              : 'Объяснение противоречия'
        }}
        · {{ skillTitle(item.skill) }}
      </h4>
      <p>{{ item.prompt }}</p>
      <template v-if="item.options"
        ><button
          v-for="(option, i) in item.options"
          :key="i"
          class="button secondary"
          :disabled="busy || !!result(item)"
          @click="check(item, i)"
        >
          {{ option }}
        </button></template
      >
      <template v-else
        ><label
          >Числовой ответ<input
            v-model="values[item.id]"
            type="number"
            class="text-input"
            :disabled="!!result(item)" /></label
        ><button
          class="button secondary"
          :disabled="busy || !!result(item) || !String(values[item.id] ?? '').trim()"
          @click="check(item, Number(values[item.id]))"
        >
          Проверить расчёт
        </button></template
      >
      <p v-if="result(item)" role="status">
        {{
          result(item)?.correct
            ? 'Первый ответ верный.'
            : 'Первый ответ ошибочный: повторите материал и решите другую задачу этого навыка.'
        }}
        {{ item.explanation }}
      </p>
    </article>
    <p role="status">{{ notice }}</p>
    <p>Итоговые доказательства: {{ final.proof }}</p>
    <RouterLink class="button primary" :to="final.url">Незнакомая итоговая работа</RouterLink>
    <p>
      Реальные ARP/NAT/VLAN, SNI/proxy, AD/Kerberos, systemd и Git проверяются в своей ОС по
      инструкции стенда. Синтетические задачи и упрощённая ACL-модель не воспроизводят весь стек.
    </p>
  </section>
</template>
