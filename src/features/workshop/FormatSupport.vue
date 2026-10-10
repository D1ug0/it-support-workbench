<script setup lang="ts">
import manifest from '../../fixtures/real/manifest.json'
const realCount = manifest.captures.length
const formats = [
  [
    'ipconfig /all',
    'CMD RU/EN; IPv4/IPv6, несколько адаптеров',
    'Ошибочное поле пропускается с предупреждением; проверяйте статус partial',
  ],
  [
    'ping / tracert / route print',
    'CMD RU/EN; ограниченные текстовые таблицы',
    'Неполные строки и неизвестные заголовки отмечаются; вывод не подтверждает весь сетевой стек',
  ],
  [
    'nslookup',
    'A/AAAA RU/EN; отдельные подготовленные MX/TXT/SRV',
    'Отделяются сервер и ответ; неполный SRV/TXT не становится полной записью',
  ],
  [
    'Resolve-DnsName',
    'UTF-8 JSON: A/AAAA/CNAME/MX/TXT/SRV',
    'Неподдерживаемые/неполные объекты пропускаются с предупреждением',
  ],
  [
    'Test-NetConnection',
    'Выбранный UTF-8 JSON; boolean TcpTestSucceeded',
    'Строка True вместо boolean отклоняется',
  ],
  [
    'Get-NetIPConfiguration',
    '1–2000 выбранных UTF-8 JSON объектов',
    'Интерфейс с неверным адресом пропускается; статус partial',
  ],
  [
    'События и трассы',
    'Учебный bounded JSON',
    'Произвольные PCAP/EVTX, systemd и Git logs не разбираются автоматически',
  ],
]
</script>
<template>
  <section class="panel feature-section">
    <h2>Поддерживаемые форматы и происхождение</h2>
    <p>
      Примеры анализатора синтетические. Настоящих обезличенных captures в отдельном manifest:
      {{ realCount }}.
      {{
        realCount
          ? 'Подтверждённые версии и локали ограничены записями manifest и их регрессиями.'
          : 'Подтверждённой матрицы версий Windows/PowerShell пока нет.'
      }}
      Текст CMD — RU/EN; JSON — только выбранные поля. Общий вход анализатора ограничен 2 MiB и 50
      000 строками.
    </p>
    <div
      class="route-table-scroll"
      role="region"
      tabindex="0"
      aria-label="Матрица форматов с горизонтальной прокруткой"
    >
      <table class="route-table format-table">
        <caption>
          Фактически проверенная синтетическая матрица
        </caption>
        <thead>
          <tr>
            <th>Формат</th>
            <th>Поддержка</th>
            <th>Граница и partial parse</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in formats" :key="row[0]">
            <th>{{ row[0] }}</th>
            <td>{{ row[1] }}</td>
            <td>{{ row[2] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Для настоящего capture нужны разрешение, версия ОС/команды, локаль, дата, обезличивание и
      ручной предпросмотр. Минимальный и проблемный fixture добавляются вместе с регрессией парсера.
      Личные диагностические данные не становятся учебными материалами автоматически.
    </p>
  </section>
</template>
<style scoped>
.format-table {
  min-width: 40rem;
  font-size: 0.85rem;
  white-space: normal;
}
.format-table th,
.format-table td {
  overflow-wrap: anywhere;
}
</style>
