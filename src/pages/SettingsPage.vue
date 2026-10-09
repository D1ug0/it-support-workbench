<script setup lang="ts">
import { onMounted, ref } from 'vue'
import OfflineControls from '../features/offline/OfflineControls.vue'
import { useAnalysisStore } from '../features/network-analysis/model/useAnalysisStore'
import { useSessionStore } from '../features/sessions/useSessionStore'
import { useLearningStore } from '../features/learning/useLearningStore'
import { useGuideStore } from '../features/guide/useGuideStore'
import { listCases } from '../features/cases/repository'
const analysis = useAnalysisStore(),
  session = useSessionStore(),
  learning = useLearningStore()
const caseCount = ref<number>()
const guide = useGuideStore()
onMounted(async () => {
  await learning.initialize()
  try {
    caseCount.value = (await listCases()).length
  } catch {
    caseCount.value = undefined
  }
})
function clearMemory() {
  if (
    !window.confirm(
      'Очистить ввод анализатора, рабочую сессию и план помощника? Сохранённые кейсы и учебный прогресс останутся.',
    )
  )
    return
  analysis.clear()
  session.clear()
  guide.clear()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ДАННЫЕ И УПРАВЛЕНИЕ</span>
      <h1>Ваше рабочее место<span class="accent">.</span></h1>
      <p>Офлайн-доступ, данные и быстрые действия под вашим контролем.</p>
    </div>
  </div>
  <OfflineControls />
  <section class="panel feature-section">
    <h2>Что хранится на этом устройстве</h2>
    <div class="history-row">
      <span>Ввод анализатора</span
      ><strong>{{ analysis.input ? 'В памяти вкладки' : 'Пусто' }}</strong>
    </div>
    <div class="history-row">
      <span>Рабочая сессия</span><strong>{{ session.records.length }} проверок в памяти</strong>
    </div>
    <div class="history-row">
      <span>Помощник диагностики</span
      ><strong>{{ guide.selected ? 'План и ответы в памяти' : 'Пусто' }}</strong>
    </div>
    <div class="history-row">
      <span>Сохранённые кейсы</span
      ><strong>{{
        caseCount === undefined ? 'Хранилище недоступно' : `${caseCount} в IndexedDB`
      }}</strong>
    </div>
    <div class="history-row">
      <span>Учебный прогресс</span
      ><strong>{{ learning.enabled ? 'Запись включена' : 'Автозапись выключена' }}</strong>
    </div>
    <div class="button-row">
      <button class="button secondary small" @click="clearMemory">Очистить временные данные</button
      ><RouterLink class="button secondary small" to="/cases">Управлять кейсами</RouterLink
      ><RouterLink class="button secondary small" to="/learning">Управлять прогрессом</RouterLink>
    </div>
    <p>
      Кейсы и прогресс не шифруются приложением и не синхронизируются. Экспортированные файлы,
      clipboard и резервные копии браузера удаляются отдельно.
    </p>
  </section>
  <section class="panel feature-section">
    <h2>Клавиатура и работа без мыши</h2>
    <dl class="shortcut-list">
      <dt>Ctrl / ⌘ + K</dt>
      <dd>Быстрый поиск разделов и знаний</dd>
      <dt>Ctrl / ⌘ + Enter</dt>
      <dd>Анализировать текст в редакторе</dd>
      <dt>Escape</dt>
      <dd>Закрыть диалог</dd>
      <dt>Tab / Shift + Tab</dt>
      <dd>Перемещаться по элементам интерфейса</dd>
      <dt>← / →</dt>
      <dd>Переключить способ ввода в анализаторе</dd>
    </dl>
  </section>
</template>
