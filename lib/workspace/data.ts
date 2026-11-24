import { z } from "zod";
import { MAX_BYTES, identifier, fieldName } from "../experiments/schema";

const finite = z.number().finite().min(-1e15).max(1e15);
const point = z
  .object({
    s: z.number().int().nonnegative().max(1e9),
    v: finite,
    t: z.string().max(80).optional(),
  })
  .strict();
export const scalarSeriesSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    points: z.array(point).min(1).max(5000),
  })
  .strict()
  .superRefine((series, ctx) => {
    const seen = new Set<number>();
    series.points.forEach((p, i) => {
      if (seen.has(p.s))
        ctx.addIssue({
          code: "custom",
          path: ["points", i, "s"],
          message:
            "Повторяется шаг: выберите выгрузку без сглаживания и preview",
        });
      seen.add(p.s);
    });
  });
export const scalarExportSchema = z
  .array(scalarSeriesSchema)
  .min(1)
  .max(40)
  .superRefine((rows, ctx) => {
    if (new Set(rows.map((r) => r.name)).size !== rows.length)
      ctx.addIssue({ code: "custom", message: "Повторяются имена серий" });
  });
export const trainingSchema = z
  .object({
    id: identifier,
    experiment: z.string().min(1).max(100),
    dataset: z.string().min(1).max(100),
    protocol: z.string().min(1).max(100),
    series: scalarExportSchema,
  })
  .strict();
export type TrainingExport = z.infer<typeof trainingSchema>;
export const abMetricSchema = z
  .object({
    metric: fieldName,
    direction: z.enum(["min", "max"]),
    role: z.enum(["primary", "guardrail", "secondary"]),
    control: finite,
    treatment: finite,
    ci_low: finite,
    ci_high: finite,
    ci_unit: z.enum(["absolute_delta", "relative_percent"]),
    confidence: z.number().min(0.5).max(0.9999),
  })
  .strict()
  .refine((r) => r.ci_low <= r.ci_high, {
    message: "Нижняя граница ДИ больше верхней",
  });
export const abSchema = z
  .object({
    id: identifier,
    control_group: z.string().min(1).max(80),
    treatment_group: z.string().min(1).max(80),
    slice: z.string().min(1).max(100),
    period_start: z.union([
      z.string().date(),
      z.string().datetime({ offset: true }),
    ]),
    period_end: z.union([
      z.string().date(),
      z.string().datetime({ offset: true }),
    ]),
    status: z.enum(["interim", "final"]).default("interim"),
    multiplicity: z
      .enum(["not_reported", "adjusted", "not_adjusted"])
      .default("not_reported"),
    metrics: z.array(abMetricSchema).min(1).max(40),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (Date.parse(d.period_start) > Date.parse(d.period_end))
      ctx.addIssue({
        code: "custom",
        message: "Период задан в обратном порядке",
      });
    if (d.control_group === d.treatment_group)
      ctx.addIssue({
        code: "custom",
        message: "Контрольная и тестовая группы совпадают",
      });
    if (new Set(d.metrics.map((m) => m.metric)).size !== d.metrics.length)
      ctx.addIssue({ code: "custom", message: "Повторяются метрики A/B" });
  });
export type ABResult = z.infer<typeof abSchema>;
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    training: z.array(trainingSchema).max(10).default([]),
    ab: z.array(abSchema).max(20).default([]),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const field of ["training", "ab"] as const)
      if (new Set(d[field].map((x) => x.id)).size !== d[field].length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Повторяются ID источников",
        });
  });
export type Workspace = z.infer<typeof workspaceSchema>;

export function parseTrainingExport(text: string) {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error(
      "Экспорт больше 2 MiB: выберите меньше серий или диапазон шагов",
    );
  const rows = scalarExportSchema.parse(JSON.parse(text));
  return rows.map((r) => ({
    ...r,
    points: [...r.points].sort((a, b) => a.s - b.s),
  }));
}
export function assertWorkspaceSize(workspace: Workspace) {
  if (
    new TextEncoder().encode(JSON.stringify(workspace, null, 2)).length >
    MAX_BYTES
  )
    throw new Error(
      "Выбранные источники вместе превышают 2 MiB. Сократите набор метрик или диапазон.",
    );
}
export function compareTraining(
  exports: TrainingExport[],
  ids: string[],
  metricNames: string[],
  requestedStep?: number,
) {
  if (!ids.length || !metricNames.length)
    throw new Error("Выберите экспорты и метрики");
  if (
    new Set(ids).size !== ids.length ||
    new Set(metricNames).size !== metricNames.length
  )
    throw new Error("Повторяются ID или метрики");
  const selected = ids.map((id) => {
    const r = exports.find((r) => r.id === id);
    if (!r) throw new Error("Неизвестный экспорт");
    return r;
  });
  if (
    new Set(
      selected.map((r) =>
        JSON.stringify([r.experiment, r.dataset, r.protocol]),
      ),
    ).size !== 1
  )
    throw new Error("Разные эксперимент, датасет или протокол оценки");
  const series = selected.flatMap((run) =>
    metricNames.map((name) => {
      const s = run.series.find((s) => s.name === name);
      if (!s) throw new Error(`Нет выбранной серии ${name} в ${run.id}`);
      return { run_id: run.id, ...s };
    }),
  );
  let common = new Set(series[0].points.map((p) => p.s));
  for (const s of series.slice(1)) {
    const steps = new Set(s.points.map((p) => p.s));
    common = new Set([...common].filter((step) => steps.has(step)));
  }
  const steps = [...common].sort((a, b) => a - b);
  const step = requestedStep ?? steps.at(-1);
  if (step === undefined || !common.has(step))
    throw new Error(
      "Нет полного общего шага для всех выбранных серий и экспортов. Интерполяция не выполняется.",
    );
  const baseline = selected[0].id;
  const rows = selected.map((run) => ({
    id: run.id,
    step,
    metrics: metricNames.map((name) => {
      const value = run.series
        .find((s) => s.name === name)!
        .points.find((p) => p.s === step)!.v;
      const base = selected[0].series
        .find((s) => s.name === name)!
        .points.find((p) => p.s === step)!.v;
      return {
        name,
        value,
        delta: value - base,
        relative_change_percent:
          base === 0 ? null : ((value - base) / Math.abs(base)) * 100,
      };
    }),
  }));
  return {
    comparison_step: step,
    common_steps_count: steps.length,
    first_common_step: steps[0],
    last_common_step: steps.at(-1),
    baseline_id: baseline,
    rows,
    caveat:
      "Сравниваются точные значения на одном общем шаге. Не смешиваются максимумы разных эпох; сглаживание и интерполяция не применяются. Экспорт не доказывает завершение обучения или статистическую значимость.",
  };
}
export function summarizeAB(result: ABResult) {
  const rows = result.metrics.map((m) => {
    const delta = m.treatment - m.control;
    const relative =
      m.control === 0 ? null : (delta / Math.abs(m.control)) * 100;
    const sign = m.direction === "max" ? 1 : -1;
    const low = m.ci_low * sign,
      high = m.ci_high * sign;
    const lo = Math.min(low, high),
      hi = Math.max(low, high);
    const relativeUndefined =
      m.ci_unit === "relative_percent" && m.control === 0;
    const signal = relativeUndefined
      ? "inconclusive"
      : lo > 0
        ? "improvement"
        : hi < 0
          ? "degradation"
          : "inconclusive";
    return {
      ...m,
      delta,
      relative_change_percent: relative,
      signal,
      warning: relativeUndefined
        ? "Относительный ДИ нельзя интерпретировать при нулевом control. Проверьте исходный отчёт."
        : null,
    };
  });
  const guardrails = rows
    .filter((m) => m.role === "guardrail" && m.signal === "degradation")
    .map((m) => m.metric);
  return {
    id: result.id,
    control_group: result.control_group,
    treatment_group: result.treatment_group,
    slice: result.slice,
    period_start: result.period_start,
    period_end: result.period_end,
    status: result.status,
    multiplicity: result.multiplicity,
    decision: guardrails.length ? "guardrail_violation" : "requires_review",
    degraded_guardrails: guardrails,
    metrics: rows,
    caveat:
      "Доверительные интервалы взяты из входного отчёта и не пересчитаны по агрегированным средним. Проверяйте единицы ДИ, метод расчёта, множественные сравнения и остановку теста. Вывод не является автоматическим решением о раскатке.",
  };
}

export function prepareWorkspace(
  source: Workspace,
  selection: {
    kind: "training" | "ab";
    exportIds: string[];
    metrics: string[];
    dataset: string;
    protocol: string;
    includeTime: boolean;
    abId?: string;
  },
): Workspace {
  let result: Workspace;
  if (selection.kind === "training") {
    const training = source.training.filter((r) =>
      selection.exportIds.includes(r.id),
    );
    if (!training.length || !selection.metrics.length)
      throw new Error("Выберите экспорты и метрики для workspace");
    if (new Set(selection.exportIds).size !== training.length)
      throw new Error("Выбран неизвестный экспорт");
    for (const run of training)
      for (const name of selection.metrics) {
        if (!run.series.some((s) => s.name === name))
          throw new Error(`Нет выбранной серии ${name} в ${run.id}`);
      }
    result = {
      version: 1,
      training: training.map((r) => ({
        ...r,
        dataset: selection.dataset,
        protocol: selection.protocol,
        series: r.series
          .filter((s) => selection.metrics.includes(s.name))
          .map((s) => ({
            ...s,
            points: s.points.map((p) =>
              selection.includeTime ? p : { s: p.s, v: p.v },
            ),
          })),
      })),
      ab: [],
    };
  } else {
    const report = source.ab.find((r) => r.id === selection.abId);
    if (!report) throw new Error("Выберите A/B-отчёт");
    result = { version: 1, training: [], ab: [report] };
  }
  result = workspaceSchema.parse(result);
  assertWorkspaceSize(result);
  return result;
}
