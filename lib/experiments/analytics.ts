import { groupKey, type Run, type Direction } from "./schema";

export function compareRuns(
  runs: Run[],
  ids: string[],
  metric: string,
  direction: Direction,
) {
  if (new Set(ids).size !== ids.length)
    throw new Error("ID в сравнении не должны повторяться");
  const selected = ids.map((id) => {
    const r = runs.find((x) => x.id === id);
    if (!r) throw new Error(`Запуск ${id} не найден`);
    return r;
  });
  if (!selected.length) throw new Error("Выберите запуски");
  if (new Set(selected.map(groupKey)).size !== 1)
    throw new Error("Разные experiment/dataset/split: сравнение некорректно");
  const eligible = selected.filter(
    (r) => r.status === "finished" && Object.hasOwn(r.metrics, metric),
  );
  const ranked = [...eligible].sort(
    (a, b) =>
      (direction === "max" ? -1 : 1) *
        (a.metrics[metric] - b.metrics[metric]) || a.id.localeCompare(b.id),
  );
  const baseline = eligible[0];
  return {
    metric,
    direction,
    baseline_id: baseline?.id ?? null,
    winner_id: ranked[0]?.id ?? null,
    tied_best_ids: ranked
      .filter((r) => r.metrics[metric] === ranked[0]?.metrics[metric])
      .map((r) => r.id),
    ranking: ranked.map((r) => {
      const delta = r.metrics[metric] - baseline.metrics[metric];
      return {
        id: r.id,
        name: r.name,
        value: r.metrics[metric],
        delta_from_baseline: delta,
        relative_change_percent:
          baseline.metrics[metric] === 0
            ? null
            : (delta / Math.abs(baseline.metrics[metric])) * 100,
        improvement_from_baseline: delta * (direction === "max" ? 1 : -1),
        duration_seconds: r.duration_seconds ?? null,
      };
    }),
    excluded: selected
      .filter((r) => !eligible.includes(r))
      .map((r) => ({
        id: r.id,
        reason:
          r.status !== "finished"
            ? `status=${r.status}`
            : `Нет метрики ${metric}`,
      })),
    caveat:
      "Один запуск не доказывает статистическую значимость или причинное влияние параметров. Сравнение допустимо только при одинаковом протоколе оценки.",
  };
}

export function diagnoseRun(run: Run) {
  const h = run.history;
  if (h.length < 4)
    return {
      id: run.id,
      signal: "insufficient_history",
      reason: "Для эвристики нужны минимум 4 точки train_loss/val_loss",
      caveat: "Это не доказательство отсутствия переобучения.",
    };
  const best = h.reduce((a, b) => (b.val_loss < a.val_loss ? b : a));
  const last = h[h.length - 1];
  const first = h[0];
  const degradation = last.val_loss - best.val_loss;
  const relative = best.val_loss === 0 ? null : degradation / best.val_loss;
  const trainFalling = last.train_loss < first.train_loss;
  const signal =
    trainFalling &&
    last.step > best.step &&
    degradation > Math.max(0.02, Math.abs(best.val_loss) * 0.1);
  return {
    id: run.id,
    signal: signal ? "possible_overfitting" : "no_clear_signal",
    best_validation_step: best.step,
    best_validation_loss: best.val_loss,
    last_validation_loss: last.val_loss,
    last_train_loss: last.train_loss,
    validation_degradation: degradation,
    relative_degradation: relative,
    rule: "train_loss снизился относительно первого шага; val_loss после минимума вырос более чем на max(0.02, 10% от минимума).",
    caveat:
      "Эвристический признак, не диагноз. Нужны повторные seed и проверка данных/протокола; история loss не определяет лучшую эпоху по другой метрике.",
  };
}
