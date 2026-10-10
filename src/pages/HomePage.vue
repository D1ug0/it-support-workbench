<script setup lang="ts">
import {
  ArrowRight,
  ArrowUpRight,
  Terminal,
  Network,
  FileCheck2,
  ShieldCheck,
  Layers3,
  Braces,
  Cable,
  Globe,
  CircleCheck,
  Play,
  ChevronRight,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useAnalysisStore } from '../features/network-analysis/model/useAnalysisStore'
import { examples } from '../fixtures'

const router = useRouter()
const store = useAnalysisStore()
function demo(id = 'normal') {
  const example = examples.find((e) => e.id === id)
  if (example) store.setInput(example.text, `Пример: ${example.name}`)
  void router.push('/analyzer')
}
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow"><span class="status-dot" /> ИНСТРУМЕНТЫ IT-ПОДДЕРЖКИ</span>
        <h1>Диагностика<br />начинается<br /><span>с фактов.</span></h1>
        <p>
          Понимайте вывод системных команд.<br class="desktop-only" />
          Находите признаки, проверяйте гипотезы.<br class="desktop-only" />
          Диагностика выполняется локально — исходный ввод остаётся на устройстве.
        </p>
        <div class="hero-buttons">
          <RouterLink to="/guide" class="button primary"
            >Разобраться по шагам <ArrowRight :size="18"
          /></RouterLink>
          <RouterLink to="/analyzer" class="button primary"
            >Открыть анализатор <ArrowUpRight :size="18" /></RouterLink
          ><button class="button secondary" @click="demo()">
            <Play :size="15" /> Попробовать пример
          </button>
        </div>
        <div class="hero-footnote">
          <ShieldCheck :size="15" /> Без установки · Учебные функции работают без аккаунта
        </div>
      </div>
      <div class="hero-console">
        <div class="console-top">
          <span class="console-dots"><i /><i /><i /></span><span>СИНТЕТИЧЕСКИЙ ПРИМЕР</span
          ><Terminal :size="15" />
        </div>
        <div class="console-body">
          <div class="terminal-command"><span>PS C:\DEMO&gt;</span> ipconfig /all</div>
          <div class="terminal-title">Windows IP Configuration</div>
          <div class="terminal-section">Ethernet adapter Ethernet:</div>
          <div class="terminal-row"><span>IPv4 Address</span><b>192.0.2.10</b></div>
          <div class="terminal-row"><span>Subnet Mask</span><b>255.255.255.0</b></div>
          <div class="terminal-row"><span>Default Gateway</span><b>192.0.2.1</b></div>
          <div class="terminal-row"><span>DNS Servers</span><b>192.0.2.53</b></div>
          <div class="terminal-row"><span>DHCP Enabled</span><b class="accent">Yes</b></div>
          <div class="console-divider"><span>СТРУКТУРИРОВАННЫЙ РАЗБОР</span></div>
          <div class="network-map">
            <div class="map-node">
              <span><Terminal :size="20" /></span><small>Компьютер</small>
            </div>
            <div class="map-connection" />
            <div class="map-node">
              <span><Cable :size="20" /></span><small>Шлюз</small>
            </div>
            <div class="map-connection" />
            <div class="map-node">
              <span><Globe :size="20" /></span><small>DNS</small>
            </div>
          </div>
          <div class="console-note">
            <CircleCheck :size="17" /><span
              >2 адаптера · 2 DNS-сервера<small
                >Конфигурация прочитана. Доступность требует проверки.</small
              ></span
            >
          </div>
        </div>
      </div>
    </section>
    <section class="section-block start-here" aria-labelledby="start-here-title">
      <div class="section-heading">
        <div>
          <span class="eyebrow">С ЧЕГО НАЧАТЬ</span>
          <h2 id="start-here-title">Выберите свою задачу</h2>
        </div>
      </div>
      <div class="start-here-grid">
        <RouterLink class="panel start-card" to="/guide"
          ><span class="tag">01 · РЕШИТЬ ПРОБЛЕМУ</span>
          <h3>Не знаю, что проверять</h3>
          <p>Выберите симптом и получите план с объяснением каждого шага.</p>
          <span class="text-link">Начать диагностику <ArrowRight :size="15" /></span></RouterLink
        ><RouterLink class="panel start-card" to="/analyzer"
          ><span class="tag">02 · ПОНЯТЬ РЕЗУЛЬТАТ</span>
          <h3>Уже есть вывод команды</h3>
          <p>Вставьте текст Windows: ipconfig, ping, nslookup, tracert или route print.</p>
          <span class="text-link">Разобрать вывод <ArrowRight :size="15" /></span></RouterLink
        ><RouterLink class="panel start-card" to="/learning"
          ><span class="tag">03 · РАЗВИВАТЬ НАВЫКИ</span>
          <h3>Хочу научиться диагностике</h3>
          <p>Шесть тем, разбор ошибок, задачи по подсетям и учебные инциденты.</p>
          <span class="text-link"
            >Открыть учебный маршрут <ArrowRight :size="15" /></span></RouterLink
        ><RouterLink class="panel start-card" to="/toolkit"
          ><span class="tag">04 · БЫСТРО НАЙТИ</span>
          <h3>Нужен расчёт или команда</h3>
          <p>Посчитайте подсеть, сравните маршруты, найдите команду или назначение порта.</p>
          <span class="text-link">Открыть инструменты <ArrowRight :size="15" /></span
        ></RouterLink>
      </div>
    </section>
    <div class="capability-strip">
      <div>
        <Braces :size="20" /><span><strong>RU / EN</strong><small>Вывод Windows CMD</small></span>
      </div>
      <div>
        <Layers3 :size="20" /><span
          ><strong>Каждый адаптер</strong><small>Собственная конфигурация</small></span
        >
      </div>
      <div>
        <FileCheck2 :size="20" /><span
          ><strong>Каждый вывод</strong><small>С доказательствами</small></span
        >
      </div>
      <div>
        <ShieldCheck :size="20" /><span
          ><strong>Каждый отчёт</strong><small>Обезличен по умолчанию</small></span
        >
      </div>
    </div>
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">РАБОЧИЙ ПРОЦЕСС</span>
          <h2>От вывода команды к следующему шагу</h2>
        </div>
        <span class="section-meta">03 простых шага</span>
      </div>
      <div class="workflow-grid">
        <article>
          <span class="step-number">01</span><Terminal :size="22" />
          <h3>Добавьте вывод</h3>
          <p>Вставьте текст <code>ipconfig /all</code> или откройте локальный .txt / .log.</p>
        </article>
        <article>
          <span class="step-number">02</span><Network :size="22" />
          <h3>Разберите факты</h3>
          <p>IP, DNS, DHCP и шлюзы по адаптерам. Каждое наблюдение ведёт к строке источника.</p>
        </article>
        <article>
          <span class="step-number">03</span><FileCheck2 :size="22" />
          <h3>Выберите проверку</h3>
          <p>Получите безопасные следующие шаги и сохраните отчёт с предварительным просмотром.</p>
        </article>
      </div>
    </section>
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">ПЕСОЧНИЦА</span>
          <h2>Начните с безопасного примера</h2>
        </div>
        <span class="section-meta">Только вымышленные данные</span>
      </div>
      <div class="example-grid">
        <button
          v-for="(example, index) in examples.slice(0, 4)"
          :key="example.id"
          class="example-card"
          @click="demo(example.id)"
        >
          <span class="example-number">{{ String(index + 1).padStart(2, '0') }}</span
          ><ArrowUpRight :size="19" class="example-arrow" /><span class="example-tag">{{
            example.tag
          }}</span
          ><strong>{{ example.name }}</strong>
          <p>{{ example.description }}</p>
          <span class="example-link">Открыть пример <ArrowRight :size="14" /></span>
        </button>
      </div>
    </section>
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">ПРАКТИКА И РАЗВИТИЕ</span>
          <h2>Соберите контекст. Закрепите знания.</h2>
        </div>
      </div>
      <div class="workflow-grid">
        <article>
          <Layers3 :size="22" />
          <h3>Рабочая сессия</h3>
          <p>
            Сопоставляйте конфигурацию, DNS и ICMP одного устройства. Смотрите, какие поля
            изменились после проверки.
          </p>
          <RouterLink to="/sessions">Создать сессию <ArrowRight :size="14" /></RouterLink>
        </article>
        <article>
          <FileCheck2 :size="22" />
          <h3>Чек-лист инцидента</h3>
          <p>
            Пройдите последовательность безопасных проверок и сохраните отмеченные шаги для разбора
            работы.
          </p>
          <RouterLink to="/playbooks">Выбрать чек-лист <ArrowRight :size="14" /></RouterLink>
        </article>
        <article>
          <Braces :size="22" />
          <h3>Учебный центр</h3>
          <p>
            Проверьте себя по шести темам, повторяйте ошибки и отслеживайте результаты учебных
            инцидентов.
          </p>
          <RouterLink to="/learning">Начать обучение <ArrowRight :size="14" /></RouterLink>
        </article>
      </div>
    </section>
    <section class="home-bottom">
      <div>
        <ShieldCheck :size="26" />
        <div>
          <h3>Уверенность там, где есть доказательства</h3>
          <p>
            Наличие DNS или шлюза не подтверждает их доступность. Workbench помогает выбрать
            проверку.
          </p>
        </div>
      </div>
      <RouterLink to="/about">Принципы проекта <ChevronRight :size="16" /></RouterLink>
    </section>
  </div>
</template>
