<script setup lang="ts">
import AppSelect from '../../../../shared/components/AppSelect.vue'
import AppSelectOption from '../../../../shared/components/AppSelectOption.vue'
import {
  faultIds,
  faultTitles,
  hypothesisEvidence,
  type ProfessionalAttempt,
} from '../../domain/professional/index'
const attempt = defineModel<ProfessionalAttempt>({ required: true })
defineProps<{ disabled?: boolean }>()
function add() {
  if (attempt.value.status !== 'active' || attempt.value.hypotheses.length >= 12) return
  attempt.value.hypotheses.push({
    id: globalThis.crypto.randomUUID(),
    fault: 'cache',
    explanation: '',
    step: null,
    conclusion: 'inconclusive',
    nextStep: '',
  })
}
</script>
<template>
  <fieldset :disabled="disabled || attempt.status !== 'active'">
    <legend>Гипотезы и доказательства</legend>
    <p>
      Свяжите гипотезу с выполненной проверкой. После изменения среды прежнее наблюдение остаётся
      доказательством исходного состояния; для текущего состояния выполните новую проверку.
    </p>
    <article v-for="(row, index) in attempt.hypotheses" :key="row.id" class="workshop-item">
      <h4>Гипотеза {{ index + 1 }}</h4>
      <label
        >Возможная причина<AppSelect v-model="row.fault" class="text-input">
          <AppSelectOption v-for="fault in faultIds" :key="fault" :value="fault">{{
            faultTitles[fault]
          }}</AppSelectOption>
        </AppSelect></label
      >
      <label
        >Обоснование<textarea v-model="row.explanation" class="text-input" maxlength="600" />
      </label>
      <label
        >Выполненная проверка<AppSelect v-model="row.step" class="text-input">
          <AppSelectOption :value="null">Пока нет данных</AppSelectOption>
          <AppSelectOption v-for="(step, i) in attempt.steps" :key="i" :value="i + 1"
            >#{{ i + 1 }} · {{ step.action }} · ревизия {{ step.revision }}</AppSelectOption
          >
        </AppSelect></label
      >
      <p>
        {{
          hypothesisEvidence(attempt, row).step?.result ??
          'Выберите проверку, чтобы сопоставить факты.'
        }}
      </p>
      <label
        >Вывод<AppSelect v-model="row.conclusion" class="text-input">
          <AppSelectOption value="confirmed">Подтверждена</AppSelectOption>
          <AppSelectOption value="refuted">Опровергнута</AppSelectOption>
          <AppSelectOption value="inconclusive">Недостаточно данных</AppSelectOption>
        </AppSelect></label
      >
      <p v-if="!hypothesisEvidence(attempt, row).matches" role="status">
        Вывод не соответствует выбранному наблюдению.
      </p>
      <p v-if="hypothesisEvidence(attempt, row).stale" role="status">
        Историческое наблюдение: среда изменилась. Оно не подтверждает текущее состояние.
      </p>
      <label
        >Следующий шаг<textarea v-model="row.nextStep" class="text-input" maxlength="600" />
      </label>
      <button class="button ghost" @click="attempt.hypotheses.splice(index, 1)">
        Удалить гипотезу {{ index + 1 }}
      </button>
    </article>
    <button class="button secondary" :disabled="attempt.hypotheses.length >= 12" @click="add">
      Добавить гипотезу
    </button>
  </fieldset>
</template>
