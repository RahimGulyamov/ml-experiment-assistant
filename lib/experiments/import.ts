import Papa from "papaparse";
import { MAX_BYTES, runsSchema, type Run } from "./schema";

export function parseImport(text: string, filename: string): Run[] {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("Файл больше 2 MiB");
  let data: unknown;
  if (filename.toLowerCase().endsWith(".json")) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Некорректный JSON");
    }
  } else if (filename.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(
      text.replace(/^\uFEFF/, ""),
      { header: true, skipEmptyLines: "greedy" },
    );
    if (parsed.errors.length)
      throw new Error(`CSV: ${parsed.errors[0].message}`);
    const headers = parsed.meta.fields || [];
    if (
      parsed.meta.renamedHeaders &&
      Object.keys(parsed.meta.renamedHeaders).length
    )
      throw new Error("CSV: повторяющиеся заголовки");
    const required = ["id", "name", "experiment", "dataset", "split"];
    if (required.some((x) => !headers.includes(x)))
      throw new Error(`CSV: нужны колонки ${required.join(", ")}`);
    if (
      headers.some(
        (x) =>
          !required.includes(x) &&
          !["status", "duration_seconds"].includes(x) &&
          !x.startsWith("metric.") &&
          !x.startsWith("param."),
      )
    )
      throw new Error(
        "CSV: неизвестная колонка. Метрики: metric.<имя>, параметры: param.<имя>",
      );
    const numeric = (v: string, field: string) => {
      if (!v.trim() || !Number.isFinite(Number(v)))
        throw new Error(`CSV: ${field} должно быть числом`);
      return Number(v);
    };
    data = parsed.data.map((row) => {
      const metrics: Record<string, number> = {};
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith("metric.") && value.trim())
          metrics[key.slice(7)] = numeric(value, key);
        if (key.startsWith("param.") && value.trim())
          params[key.slice(6)] = value;
      }
      return {
        ...Object.fromEntries(required.map((k) => [k, row[k]])),
        metrics,
        params,
        status: row.status?.trim() || "finished",
        history: [],
        ...(row.duration_seconds?.trim()
          ? {
              duration_seconds: numeric(
                row.duration_seconds,
                "duration_seconds",
              ),
            }
          : {}),
      };
    });
  } else throw new Error("Поддерживаются только .json и .csv");
  return runsSchema.parse(data);
}
