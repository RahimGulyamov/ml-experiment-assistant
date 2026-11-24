# Происхождение данных

`iris.csv` — Iris в формате scikit-learn 1.7.2:
https://github.com/scikit-learn/scikit-learn/blob/1.7.2/sklearn/datasets/data/iris.csv

Оригинал: Fisher, R. (1936). Iris [Dataset]. UCI Machine Learning Repository.
DOI: https://doi.org/10.24432/C56C76. Лицензия датасета: CC BY 4.0.
Источник лицензии: https://archive.ics.uci.edu/dataset/53/iris.
Версия CSV содержит числовые метки классов и строку заголовка.
SHA256: `f13ffa8fdd56fd8e6c8d16d4081a3fbd3114bcd0aae4256c43205169cd9d1449`.

`public/examples/measured-iris.json` получен реальным запуском
`scripts/generate-real-experiments.py`, без LLM. Это softmax-регрессия, full-batch
обновления градиента, L2 без штрафа bias. Масштабирование обучается только на train.
Фиксированное стратифицированное разбиение: 120 train / 30 validation, seed 2026.
Метрики итоговой эпохи; история loss сохраняется каждые пять эпох и на первой.

Точность на 30 validation-примерах имеет низкую разрешающую способность.
Отдельного test нет; после выбора параметров эти validation-оценки нельзя
использовать как несмещённую оценку обобщения. Время измеряется perf_counter и
меняется с оборудованием. Конфигурации с разными epochs или l2 не являются
повторными seed одного и того же эксперимента.

`lib/experiments/demo.ts` и `public/examples/experiments.*` — отдельный
синтетический учебный сценарий CIFAR-10. Числа там не являются замерами ResNet.
