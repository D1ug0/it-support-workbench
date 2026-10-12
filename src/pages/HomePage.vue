<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  Terminal,
  MessageSquare,
  ShieldCheck,
  Check,
  Search,
  RotateCcw,
} from '@lucide/vue'
import ContinueLearning from '../features/workshop/ui/learning/ContinueLearning.vue'
const steps = [
  { icon: BookOpen, title: 'Понять', text: 'Короткий материал и проверка нужного принципа' },
  {
    icon: Terminal,
    title: 'Применить',
    text: 'Диагностика в виртуальном стенде с понятным состоянием',
  },
  {
    icon: MessageSquare,
    title: 'Объяснить',
    text: 'Разбор действий, доказательства и собственный вывод',
  },
  { icon: RotateCcw, title: 'Закрепить', text: 'Новая причина и проверка после перерыва' },
]
</script>
<template>
  <div class="learner-home">
    <section class="learner-hero" aria-labelledby="learner-home-title">
      <div class="learner-hero-copy">
        <span class="eyebrow"><span class="status-dot" /> УЧИМСЯ IT-ДИАГНОСТИКЕ</span>
        <h1 id="learner-home-title">Понимать проблему.<br /><span>Находить решение.</span></h1>
        <p>
          Учитесь разбирать неисправности, выбирать проверки и подтверждать исправление. От первого
          объяснения — к самостоятельному инциденту.
        </p>
        <div class="button-row">
          <RouterLink class="button primary" to="/learning"
            >Открыть мой маршрут <ArrowRight :size="18" /></RouterLink
          ><RouterLink class="button secondary" to="/terminal?lab=TERM-DNS-SERVER&mode=guided"
            ><Terminal :size="17" /> Попробовать лабораторию</RouterLink
          >
          <RouterLink class="button ghost" to="/getting-started">Как пользоваться</RouterLink>
        </div>
        <div class="learner-hero-note">
          <ShieldCheck :size="17" /><span
            >Без аккаунта · Виртуальный стенд · Сохранение по вашему выбору</span
          >
        </div>
      </div>
      <div class="learner-preview" aria-label="Пример учебного процесса">
        <div class="learner-preview-top">
          <span class="lesson-chip">УЧЕБНАЯ ЗАЯВКА</span><span class="muted">01 / Диагностика</span>
        </div>
        <h2>Портал не открывается</h2>
        <p>Сначала выясним масштаб и соберём наблюдения. Причину предстоит установить.</p>
        <div class="learner-preview-check">
          <Check :size="17" /><span>Уточнить, какое действие не работает</span>
        </div>
        <div class="learner-preview-check">
          <Search :size="17" /><span>Выбрать проверку гипотезы</span>
        </div>
        <div class="learner-preview-command">
          <span>Виртуальный терминал</span><code>help Test-NetConnection</code
          ><small>У каждой проверки есть смысл и граница вывода</small>
        </div>
        <div class="learner-preview-bottom">
          <span class="status-dot" /><span>Изменение → свежая проверка → объяснение</span>
        </div>
      </div>
    </section>
    <ContinueLearning :compact="true" />
    <section class="learner-method">
      <div class="section-heading">
        <div>
          <span class="eyebrow">КАК ВЫ БУДЕТЕ УЧИТЬСЯ</span>
          <h2>Один понятный процесс</h2>
        </div>
        <span class="section-meta">Знание становится действием</span>
      </div>
      <div class="learner-method-grid">
        <article v-for="(step, index) in steps" :key="step.title">
          <span class="learner-method-index">0{{ index + 1 }}</span
          ><component :is="step.icon" :size="24" />
          <h3>{{ step.title }}</h3>
          <p>{{ step.text }}</p>
        </article>
      </div>
    </section>
    <section class="learner-tools">
      <div>
        <span class="eyebrow">ИНСТРУМЕНТЫ РЯДОМ</span>
        <h2>Есть собственный результат проверки?</h2>
        <p>
          Разберите поддерживаемый вывод, сравните наблюдения или найдите команду. Эти инструменты
          доступны и вне учебного маршрута.
        </p>
      </div>
      <div class="button-row">
        <RouterLink class="button secondary" to="/analyzer">Разобрать вывод</RouterLink
        ><RouterLink class="button ghost" to="/toolkit"
          >Расчёты и команды <ArrowRight :size="16"
        /></RouterLink>
      </div>
    </section>
  </div>
</template>
