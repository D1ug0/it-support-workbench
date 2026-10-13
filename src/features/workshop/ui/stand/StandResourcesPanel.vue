<script setup lang="ts">
import linuxGuide from '../../../../../lab-environments/linux-http/README.md?raw'
import composeTemplate from '../../../../../lab-environments/linux-http/compose.yaml?raw'
import dockerTemplate from '../../../../../lab-environments/linux-http/Dockerfile?raw'
import serverTemplate from '../../../../../lab-environments/linux-http/server.py?raw'
import controlTemplate from '../../../../../lab-environments/linux-http/control.py?raw'
import standGuide from '../../../../../docs/REAL_LAB.md?raw'
import fixtureGuide from '../../../../../docs/REAL_FIXTURES.md?raw'
import fixtureCollector from '../../../../../scripts/collect-windows-fixtures.ps1?raw'
import gitGuide from '../../../../../lab-environments/git-ci/README.md?raw'
import gitTemplate from '../../../../../lab-environments/git-ci/create.mjs?raw'
import StandPanel from './StandPanel.vue'
import { downloadText } from '../../../../infrastructure/export/exportReport'
</script>
<template>
  <section class="panel feature-section">
    <h3>Практика на настоящей ОС</h3>
    <p>
      Терминал Workbench моделирует ограниченные команды. Следующий уровень — собственная
      изолированная Windows/Linux VM. Приложение не устанавливает и не запускает её автоматически.
    </p>
    <ol>
      <li>
        Создайте свою VM с допустимым образом ОС и отдельной учебной сетью; используйте вымышленные
        данные.
      </li>
      <li>Сохраните снимок исправного состояния и план адресации.</li>
      <li>Получите исходные результаты команд и запишите версию ОС, локаль и время.</li>
      <li>
        Внесите одну учебную неисправность. Выполните диагностику, исправление и повторную проверку.
      </li>
      <li>
        Вручную откройте допустимый текст или выбранный PowerShell JSON в анализаторе Workbench.
      </li>
      <li>Сформируйте отчёт, затем восстановите снимок и повторите другой вариант.</li>
    </ol>
    <details>
      <summary>Полная инструкция для будущего стенда и Windows fixtures</summary>
      <pre class="workshop-report-preview" tabindex="0">{{ standGuide }}</pre>
    </details>
    <button class="button secondary" @click="downloadText(standGuide, 'workbench-real-lab.md')">
      Скачать инструкцию стенда
    </button>
    <details>
      <summary>Воспроизводимый Linux/HTTP-стенд в двух контейнерах</summary>
      <pre class="workshop-report-preview" tabindex="0">{{ linuxGuide }}</pre>
      <p>
        Сохраните пять файлов в отдельную учебную папку; команды выполняются вручную вне браузера.
      </p>
      <div class="button-row">
        <button
          v-for="[name, text] in [
            ['README.md', linuxGuide],
            ['compose.yaml', composeTemplate],
            ['Dockerfile', dockerTemplate],
            ['server.py', serverTemplate],
            ['control.py', controlTemplate],
          ]"
          :key="name"
          class="button secondary"
          @click="downloadText(text!, name!)"
        >
          Скачать {{ name }}
        </button>
      </div>
    </details>
    <details>
      <summary>Воспроизводимый Git-стенд с конфликтом и проверками</summary>
      <pre class="workshop-report-preview" tabindex="0">{{ gitGuide }}</pre>
      <div class="button-row">
        <button class="button secondary" @click="downloadText(gitGuide, 'README.md')">
          Скачать инструкцию Git
        </button>
        <button class="button secondary" @click="downloadText(gitTemplate, 'create.mjs')">
          Скачать подготовку Git-стенда
        </button>
      </div>
    </details>
    <h4>Задания для стенда</h4>
    <details>
      <summary>Сбор и приём настоящих Windows fixtures</summary>
      <p>
        Windows captures пока отсутствуют. Скрипт запускается вручную на своём стенде и сохраняет
        raw локально для вашего просмотра; автоматической отправки нет.
      </p>
      <pre class="workshop-report-preview" tabindex="0">{{ fixtureGuide }}</pre>
      <button class="button secondary" @click="downloadText(fixtureGuide, 'REAL_FIXTURES.md')">
        Скачать процесс приёма fixtures
      </button>
      <button
        class="button secondary"
        @click="downloadText(fixtureCollector, 'collect-windows-fixtures.ps1')"
      >
        Скачать сборщик Windows
      </button>
    </details>
    <StandPanel />
    <ul>
      <li>Windows: настройки адаптеров, DNS-кэш, служба, журналы, результирующая политика.</li>
      <li>Linux: файл конфигурации, владелец/группа/права, status службы и journal.</li>
      <li>Сети: локальная доставка, удалённая сеть, выбранный маршрут, отдельно IPv4/IPv6.</li>
      <li>Приложение: TCP, TLS, HTTP и пользовательский сценарий.</li>
      <li>
        Восстановление: копия данных, новое окружение, проверка результата без удаления исходного.
      </li>
    </ul>
    <RouterLink class="button secondary" to="/analyzer">Открыть анализатор результатов</RouterLink>
    <p>
      Реальные Windows fixtures, аппаратная радиосреда и ручная проверка экранного диктора требуют
      соответствующего окружения; синтетический результат не подтверждает их выполнение.
    </p>
  </section>
</template>
