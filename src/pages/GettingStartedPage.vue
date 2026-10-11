<script setup lang="ts">
import { ArrowRight, Download, BookOpen, Compass } from '@lucide/vue'
import { downloadText } from '../infrastructure/export/exportReport'
import {
  guideIntroduction,
  firstSteps,
  starterLessons,
  sessionSteps,
  progressMeanings,
  guideTools,
  guideFaq,
  userGuideMarkdown,
} from '../features/learning/userGuide'
import '../shared/styles/user-guide.css'
const sections = [
  ['guide-start', 'Первый запуск'],
  ['guide-skills', 'Чему можно научиться'],
  ['guide-session', 'Как проходить занятие'],
  ['guide-progress', 'Как читать прогресс'],
  ['guide-tools', 'Какой раздел открыть'],
  ['guide-faq', 'Частые вопросы'],
] as const
function downloadGuide() {
  downloadText(userGuideMarkdown(), 'it-support-workbench-user-guide.md')
}
</script>
<template>
  <div class="user-guide-page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">ИНСТРУКЦИЯ ДЛЯ УЧЕНИКА</span>
        <h1>Как пользоваться приложением</h1>
        <p>{{ guideIntroduction }}</p>
      </div>
    </header>
    <section class="panel user-guide-intro" aria-label="С чего начать">
      <Compass :size="28" />
      <div>
        <h2>Начните с одного занятия</h2>
        <p>
          Откройте маршрут L1, прочитайте первый материал и попробуйте лабораторию с подсказками.
          При следующем посещении ориентируйтесь на карточку следующего шага.
        </p>
        <div class="button-row">
          <RouterLink class="button primary" to="/learning"
            >Начать обучение <ArrowRight :size="17" /></RouterLink
          ><button class="button secondary" @click="downloadGuide">
            <Download :size="17" /> Скачать инструкцию
          </button>
        </div>
      </div>
    </section>
    <div class="user-guide-layout">
      <nav class="panel user-guide-toc" aria-label="Разделы инструкции">
        <span class="eyebrow">НА ЭТОЙ СТРАНИЦЕ</span
        ><RouterLink
          v-for="[id, title] in sections"
          :key="id"
          :to="{ path: '/getting-started', hash: `#${id}` }"
          >{{ title }} <ArrowRight :size="14"
        /></RouterLink>
      </nav>
      <div class="user-guide-content">
        <section
          id="guide-start"
          class="panel user-guide-section"
          aria-labelledby="guide-start-title"
        >
          <span class="eyebrow">01 / ПЕРВЫЙ ЗАПУСК</span>
          <h2 id="guide-start-title">Ваши первые шаги</h2>
          <ol class="user-guide-steps">
            <li v-for="step in firstSteps" :key="step.title">
              <h3>{{ step.title }}</h3>
              <p>{{ step.description }}</p>
              <RouterLink class="text-link" :to="step.to"
                >{{ step.action }} <ArrowRight :size="15"
              /></RouterLink>
            </li>
          </ol>
        </section>
        <section
          id="guide-skills"
          class="panel user-guide-section"
          aria-labelledby="guide-skills-title"
        >
          <span class="eyebrow">02 / НАВЫКИ</span>
          <h2 id="guide-skills-title">Первые пять занятий</h2>
          <p>
            После этого маршрута вы сможете лучше различать уровни проблемы, выбирать подходящую
            проверку и объяснять её результат. Каждая тема закрепляется лабораторией.
          </p>
          <ol class="user-guide-lessons">
            <li v-for="lesson in starterLessons" :key="lesson.id">
              <BookOpen :size="20" />
              <div>
                <h3>{{ lesson.title }}</h3>
                <p>{{ lesson.goal }}</p>
                <RouterLink class="text-link" :to="lesson.to"
                  >Открыть занятие <ArrowRight :size="15"
                /></RouterLink>
              </div>
            </li>
          </ol>
        </section>
        <section
          id="guide-session"
          class="panel user-guide-section"
          aria-labelledby="guide-session-title"
        >
          <span class="eyebrow">03 / ОДНО ЗАНЯТИЕ</span>
          <h2 id="guide-session-title">От условия к подтверждённому результату</h2>
          <ol class="user-guide-steps">
            <li v-for="step in sessionSteps" :key="step.title">
              <h3>{{ step.title }}</h3>
              <p>{{ step.description }}</p>
            </li>
          </ol>
          <div class="user-guide-example">
            <strong>Пример: «Портал не открывается»</strong>
            <p>
              Уточните, у кого возникает отказ. Сравните разрешение имени, путь, транспорт и ответ
              приложения. Обоснуйте изменение и повторите нужную проверку. В отчёте укажите
              наблюдения и то, чего они не доказывают.
            </p>
            <code>help</code><code>help Test-NetConnection</code
            ><small
              >Справка помогает выбрать поддерживаемую проверку; причина определяется по
              наблюдениям.</small
            >
          </div>
        </section>
        <section
          id="guide-progress"
          class="panel user-guide-section"
          aria-labelledby="guide-progress-title"
        >
          <span class="eyebrow">04 / РЕЗУЛЬТАТЫ</span>
          <h2 id="guide-progress-title">Как понять, что получается лучше</h2>
          <article v-for="item in progressMeanings" :key="item.title">
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </article>
          <p>
            Ручная рубрика помогает разобрать объяснение и не повышает балл симулятора. Сохранённые
            редакции отчёта позволяют вернуться к предыдущему тексту и замечаниям.
          </p>
          <RouterLink class="button secondary" to="/learning?view=progress"
            >Открыть мой прогресс <ArrowRight :size="16"
          /></RouterLink>
        </section>
        <section
          id="guide-tools"
          class="panel user-guide-section"
          aria-labelledby="guide-tools-title"
        >
          <span class="eyebrow">05 / НАВИГАЦИЯ</span>
          <h2 id="guide-tools-title">Когда какой раздел нужен</h2>
          <dl class="user-guide-tools">
            <template v-for="tool in guideTools" :key="tool.to"
              ><dt>
                <RouterLink :to="tool.to">{{ tool.title }} <ArrowRight :size="14" /></RouterLink>
              </dt>
              <dd>{{ tool.when }}</dd></template
            >
          </dl>
          <p>
            Авторская мастерская нужна для создания и обмена заданиями. Начальный маршрут можно
            пройти через раздел «Обучение».
          </p>
        </section>
        <section id="guide-faq" class="panel user-guide-section" aria-labelledby="guide-faq-title">
          <span class="eyebrow">06 / ВОПРОСЫ</span>
          <h2 id="guide-faq-title">Если пока непонятно</h2>
          <details v-for="item in guideFaq" :key="item.question" class="user-guide-faq">
            <summary>{{ item.question }}</summary>
            <p>{{ item.answer }}</p>
          </details>
        </section>
      </div>
    </div>
  </div>
</template>
