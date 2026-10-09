<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X, Download, ShieldCheck, AlertTriangle, FolderPlus } from '@lucide/vue'
import type { AnalysisResult } from '../../../domain/types/diagnostic'
import type { ParsedOutput } from '../../../domain/types/outputs'
import {
  exportReport,
  downloadText,
  redactReport,
} from '../../../infrastructure/export/exportReport'

const props = defineProps<{ result: AnalysisResult<ParsedOutput>; raw: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const saved = ref(false)
const saveError = ref('')
const saving = ref(false)
const caseTitle = ref('')
async function saveLocal() {
  const kind = props.result.parse.kind
  if (kind === 'unknown' || saving.value || saved.value) return
  saving.value = true
  try {
    const { saveCase } = await import('../../cases/repository')
    await saveCase({
      id: globalThis.crypto.randomUUID(),
      title: caseTitle.value.trim() || `${kind} · ${new Date().toLocaleString('ru-RU')}`,
      command: kind,
      createdAt: props.result.createdAt,
      report: redactReport(props.result),
    })
    saved.value = true
  } catch {
    saveError.value =
      'Не удалось сохранить кейс. Проверьте доступность хранилища и лимит 100 кейсов.'
  } finally {
    saving.value = false
  }
}

const includeRaw = ref(false)
const consent = ref(false)
const format = ref<'md' | 'txt'>('md')
const report = computed(() =>
  exportReport(props.result, includeRaw.value && consent.value ? props.raw : undefined),
)
onMounted(() => dialog.value?.showModal())
function close() {
  dialog.value?.close()
  emit('close')
}
function download() {
  downloadText(
    report.value,
    `workbench-report.${format.value}`,
    format.value === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
  )
}
</script>

<template>
  <dialog
    ref="dialog"
    class="report-dialog"
    aria-labelledby="report-title"
    @close="emit('close')"
    @cancel.prevent="close"
  >
    <div class="dialog-heading">
      <div>
        <span class="eyebrow">ЛОКАЛЬНЫЙ ЭКСПОРТ</span>
        <h2 id="report-title">Предпросмотр отчёта</h2>
      </div>
      <button class="icon-button" aria-label="Закрыть предпросмотр" @click="close">
        <X :size="21" />
      </button>
    </div>
    <div class="report-privacy">
      <ShieldCheck :size="19" />
      <p>
        Имена, описания, MAC и исходные строки исключены. Недокументационные IP замаскированы.
        Просмотрите содержимое перед передачей.
      </p>
    </div>
    <pre
      class="report-content"
      data-testid="report-preview"
      tabindex="0"
      role="region"
      aria-label="Текст диагностического отчёта"
      >{{ report }}</pre>
    <div class="report-options">
      <label class="checkbox-label"
        ><input v-model="includeRaw" type="checkbox" @change="consent = false" /> Включить исходные
        данные</label
      >
      <div v-if="includeRaw" class="raw-warning">
        <AlertTriangle :size="18" />
        <div>
          <strong>Исходный текст не будет обезличен</strong>
          <p>Он может содержать адреса, имена и другие конфиденциальные значения.</p>
          <label class="checkbox-label"
            ><input v-model="consent" type="checkbox" /> Подтверждаю включение необезличенного
            исходника</label
          >
        </div>
      </div>
    </div>
    <div class="local-save-row">
      <label class="case-title-label"
        >Название проверки (необязательно)<input
          v-model="caseTitle"
          class="text-input"
          maxlength="100"
          placeholder="Например: до подключения VPN" /></label
      ><button class="button secondary small" :disabled="saved || saving" @click="saveLocal">
        <FolderPlus :size="15" />
        {{
          saved
            ? 'Кейс сохранён на устройстве'
            : saving
              ? 'Сохранение…'
              : 'Сохранить локальный кейс'
        }}</button
      ><span>Только обезличенный отчёт · без исходника</span>
      <p v-if="saveError" role="alert">{{ saveError }}</p>
    </div>
    <div class="dialog-footer">
      <label class="format-select"
        >Формат<select v-model="format">
          <option value="md">Markdown (.md)</option>
          <option value="txt">Текст (.txt)</option>
        </select></label
      ><button class="button primary" :disabled="includeRaw && !consent" @click="download">
        <Download :size="17" /> Скачать отчёт
      </button>
    </div>
  </dialog>
</template>
