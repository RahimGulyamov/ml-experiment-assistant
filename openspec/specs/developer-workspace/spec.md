# Developer workspace

## Purpose
Подготовить проверяемый контекст для анализа Training и агрегированных A/B-результатов
в AI-клиенте через read-only MCP, не связывая корпоративные доступы с публичным сайтом.

## Requirements

### Requirement: Training scalar import
Система SHALL читать массив серий name/points со значениями s/t/v, отклонять
нечисловые значения и повторяющиеся шаги. Сравнение SHALL использовать один полный
общий шаг всех выбранных серий и запусков без интерполяции или смешения максимумов.
Экспорт скаляров SHALL не считаться доказательством завершения обучения.

#### Scenario: Unequal horizons
- GIVEN A имеет шаги 100, 200, 300, B — 100, 200
- WHEN сравниваются val/quality и val/loss
- THEN используются значения обеих метрик на шаге 200, а не A на 300.

#### Scenario: Different evaluation protocols
- WHEN источники имеют разные dataset или protocol
- THEN сравнение отклоняется с объяснением.

### Requirement: Explicit A/B evidence
Система SHALL сохранять контрольную/тестовую группы, период, срез, направление,
единицы ДИ и сведения о множественных сравнениях. Система SHALL не восстанавливать
ДИ из одних средних или автоматически рекомендовать раскатку.

#### Scenario: Guardrail dominates primary improvement
- GIVEN целевая метрика улучшилась, но ДИ guardrail находится в зоне ухудшения
- WHEN вызывается analyze_ab_result
- THEN результат содержит guardrail_violation и список ухудшенных guardrails.

#### Scenario: Interval crosses zero
- WHEN входной ДИ изменения содержит ноль
- THEN направление сигнала отмечается как inconclusive.

### Requirement: Local MCP scope
Локальный сервер SHALL использовать официальный SDK и stdio. Данные SHALL задаваться
явным workspace-файлом со строгой схемой и лимитом 2 MiB. Инструменты SHALL быть
read-only без shell, произвольных путей и сетевых endpoint в аргументах.

#### Scenario: Workspace server discovery
- WHEN SDK-клиент запускает stdio сервер с выбранным workspace
- THEN доступны инструменты сравнения Training и анализа A/B
- AND не примешиваются демонстрационные запуски.

### Requirement: Honest LLM verification
Отчёт SHALL отличать реальную LLM, сценарный провайдер, web API и запуск через
корпоративный launcher. Успех одного маршрута SHALL не подтверждать другой.

#### Scenario: Codex uses existing subscription
- WHEN локальный авторизованный Codex выполняет проверку искусственных fixtures
- THEN успех фиксируется только при завершённых MCP-вызовах и правильных числах
- AND отдельно отмечается отсутствие проверки UI launcher и web API.

### Requirement: Browser-local preparation
Страница developer SHALL обрабатывать файлы локально, показывать выбранные серии
и не отправлять workspace на сервер. Скачиваемый контекст SHALL включать только
открытую вкладку; время точек исключается по умолчанию.

#### Scenario: Training export preparation
- WHEN пользователь импортирует Training JSON и скачивает workspace
- THEN выгрузка включает выбранные серии с псевдонимами источников
- AND не включает имена исходных файлов, посторонние A/B-данные и время t без выбора.
