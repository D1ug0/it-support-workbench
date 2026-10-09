<script setup lang="ts">
import {
  ShieldCheck,
  Braces,
  Network,
  FileCheck2,
  ArrowUpRight,
  Terminal,
  LockKeyhole,
} from '@lucide/vue'
const principles = [
  {
    icon: ShieldCheck,
    title: 'Приватность по умолчанию',
    text: 'Ввод находится только в оперативной памяти вкладки. Нет телеметрии, облачных API и автоматического сохранения.',
  },
  {
    icon: Braces,
    title: 'Объяснимые правила',
    text: 'Результат формируют чистые TypeScript-функции. Никаких случайных ответов или недоказанных диагнозов.',
  },
  {
    icon: Network,
    title: 'Контекст каждого интерфейса',
    text: 'DNS, адреса и шлюзы принадлежат конкретному адаптеру. Состояние одного интерфейса не описывает весь компьютер.',
  },
  {
    icon: FileCheck2,
    title: 'Доказательства вместо догадок',
    text: 'Каждое наблюдение связано со строками источника и сопровождается ограничениями и следующими проверками.',
  },
]
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">ПРИНЦИПЫ / АРХИТЕКТУРА</span>
      <h1>Инструмент, которому<br />можно доверять<span class="accent">.</span></h1>
      <p>IT Support Workbench — локальная рабочая среда для инженера поддержки.</p>
    </div>
    <span class="tag">OPEN SOURCE · MIT</span>
  </div>
  <section class="about-intro panel">
    <Terminal :size="30" />
    <div>
      <h2>Понимать. Проверять. Документировать.</h2>
      <p>
        Вставьте результаты стандартной команды Windows. Workbench структурирует вывод, находит
        наблюдаемые признаки и помогает выбрать следующий шаг. Анализ выполняется на вашем
        устройстве после загрузки статических файлов приложения.
      </p>
    </div>
  </section>
  <div class="principles-grid">
    <article v-for="principle in principles" :key="principle.title" class="panel principle">
      <component :is="principle.icon" :size="25" />
      <h2>{{ principle.title }}</h2>
      <p>{{ principle.text }}</p>
    </article>
  </div>
  <section class="section-block about-details">
    <div class="section-heading">
      <div>
        <span class="eyebrow">ГРАНИЦЫ ИНТЕРПРЕТАЦИИ</span>
        <h2>Что подтверждает разбор</h2>
      </div>
    </div>
    <div class="about-columns">
      <div>
        <h3>Наблюдаемые факты</h3>
        <ul>
          <li>Назначенные адреса IPv4 / IPv6 и маски.</li>
          <li>Указанные шлюзы, DNS и состояние DHCP.</li>
          <li>Явный статус отключения интерфейса.</li>
          <li>Признаки APIPA и виртуальных интерфейсов.</li>
        </ul>
      </div>
      <div>
        <h3>Нужны дополнительные проверки</h3>
        <ul>
          <li>Доступность устройства, интернета или сервиса.</li>
          <li>Фактический ответ DNS-сервера.</li>
          <li>Путь к ресурсу и политика VPN.</li>
          <li>Причина сбоя и необходимость изменения настроек.</li>
        </ul>
      </div>
    </div>
  </section>
  <section class="privacy-explainer panel">
    <LockKeyhole :size="26" />
    <div>
      <h2>Как обрабатываются ваши данные</h2>
      <p>
        Текст и выбранный файл читаются локально. Нажатие «Очистить всё» сбрасывает ввод, результаты
        и ссылки на доказательства. Обновление страницы начинает новую сессию. Экспорт создаёт файл
        на устройстве; исходные данные включаются только после отдельного подтверждения.
      </p>
      <p>
        Сохранённые вами кейсы — отдельное локальное хранилище. В них записывается обезличенный
        отчёт; они остаются после обновления страницы и очистки анализатора. Удалить их можно в
        разделе «Локальные кейсы». Название кейса и импортируемый JSON также требуют проверки.
      </p>
      <p>
        Обезличивание не гарантирует удаления всех конфиденциальных сведений. Проверяйте
        предпросмотр отчёта. Использование корпоративных логов требует разрешения организации.
      </p>
      <p>
        Рабочие сессии хранят добавленные проверки в памяти до очистки или перезагрузки. Учебный
        прогресс можно сохранять отдельно по вашему выбору. В настройках доступен офлайн-режим:
        после первого включения он сохраняет только файлы приложения.
      </p>
    </div>
  </section>
  <div class="about-sources">
    <h2>Первичные источники</h2>
    <a
      href="https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig"
      target="_blank"
      rel="noopener noreferrer"
      >Microsoft Learn · ipconfig <ArrowUpRight :size="16" /></a
    ><a href="https://www.rfc-editor.org/rfc/rfc5737" target="_blank" rel="noopener noreferrer"
      >RFC 5737 · адреса для документации <ArrowUpRight :size="16" /></a
    ><a
      href="https://developer.mozilla.org/en-US/docs/Web/API/File_API"
      target="_blank"
      rel="noopener noreferrer"
      >MDN · File API <ArrowUpRight :size="16"
    /></a>
  </div>
</template>
