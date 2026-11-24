"use client";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileJson,
  Info,
  Terminal,
  Upload,
} from "lucide-react";
import {
  abSchema,
  workspaceSchema,
  parseTrainingExport,
  compareTraining,
  summarizeAB,
  prepareWorkspace,
  type Workspace,
  type TrainingExport,
} from "@/lib/workspace/data";
import { DEMO_WORKSPACE } from "@/lib/workspace/demo";
import { MAX_BYTES, validationMessage } from "@/lib/experiments/schema";
const fmt = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumSignificantDigits: 6 }).format(v);
function save(name: string, data: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export default function DeveloperWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(DEMO_WORKSPACE);
  const [tab, setTab] = useState<"training" | "ab">("training");
  const [metrics, setMetrics] = useState(["val/quality", "val/loss"]);
  const [ids, setIds] = useState(["training-a", "training-b"]);
  const [error, setError] = useState("");
  const [trainingSource, setTrainingSource] = useState("Искусственные примеры");
  const [abSource, setAbSource] = useState("Искусственный A/B-пример");
  const [dataset, setDataset] = useState("dataset-1");
  const [protocol, setProtocol] = useState("evaluation-v1");
  const [sameProtocol, setSameProtocol] = useState(true);
  const [includeTime, setIncludeTime] = useState(false);
  const [abId, setAbId] = useState("ab-demo");
  const file = useRef<HTMLInputElement>(null);
  const abFile = useRef<HTMLInputElement>(null);
  const selected = workspace.training.filter((r) => ids.includes(r.id));
  const names = [
    ...new Set(workspace.training.flatMap((r) => r.series.map((s) => s.name))),
  ];
  const comparison = useMemo(() => {
    try {
      if (!sameProtocol)
        return {
          error:
            "Подтвердите одинаковый датасет и протокол оценки. Экспорт скаляров не содержит этой гарантии.",
        };
      return {
        data: compareTraining(
          workspace.training,
          workspace.training.filter((r) => ids.includes(r.id)).map((r) => r.id),
          metrics,
        ),
      };
    } catch (e) {
      return { error: validationMessage(e) };
    }
  }, [workspace, ids, metrics, sameProtocol]);
  const ab = workspace.ab.find((r) => r.id === abId) || workspace.ab[0];
  const abResult = ab ? summarizeAB(ab) : null;
  async function importTraining(files: FileList | null) {
    if (!files?.length) return;
    try {
      if (files.length > 10) throw new Error("Не более 10 экспортов за раз");
      const next: TrainingExport[] = [];
      for (const [i, f] of Array.from(files).entries()) {
        if (f.size > MAX_BYTES) throw new Error("Один экспорт больше 2 MiB");
        next.push({
          id: `export-${String(i + 1).padStart(3, "0")}`,
          experiment: "imported-experiment",
          dataset,
          protocol,
          series: parseTrainingExport(await f.text()),
        });
      }
      const common = next[0].series
        .map((s) => s.name)
        .filter((n) => next.every((r) => r.series.some((s) => s.name === n)));
      const preferred = common.filter((n) => /val|eval/i.test(n)).slice(0, 8);
      setWorkspace((w) => ({ ...w, training: next }));
      setIds(next.map((r) => r.id));
      setMetrics(preferred.length ? preferred : common.slice(0, 3));
      setSameProtocol(false);
      setTrainingSource("Локально загруженные скалярные экспорты");
      setError("");
    } catch (e) {
      setError(validationMessage(e));
    }
    if (file.current) file.current.value = "";
  }
  async function importAB(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > MAX_BYTES) throw new Error("Файл больше 2 MiB");
      const parsed: unknown = JSON.parse(await f.text());
      const next =
        typeof parsed === "object" && parsed !== null && "version" in parsed
          ? workspaceSchema.parse(parsed).ab
          : [abSchema.parse(parsed)];
      if (!next.length) throw new Error("В файле нет A/B-отчётов");
      setWorkspace((w) => ({ ...w, ab: next }));
      setAbId(next[0].id);
      setAbSource("Локально загруженный агрегированный A/B-отчёт");
      setError("");
    } catch (e) {
      setError(validationMessage(e));
    }
    if (abFile.current) abFile.current.value = "";
  }
  function exportWorkspace() {
    try {
      if (tab === "training" && (!selected.length || !metrics.length))
        throw new Error("Выберите экспорты и метрики для workspace");
      if (tab === "training" && selected.length && !sameProtocol)
        throw new Error("Сначала подтвердите совместимость Training-экспортов");
      const result = prepareWorkspace(workspace, {
        kind: tab,
        exportIds: ids,
        metrics,
        dataset,
        protocol,
        includeTime,
        abId: ab?.id,
      });
      save("run-notes-workspace.json", result);
    } catch (e) {
      setError(validationMessage(e));
    }
  }
  return (
    <main className="developer-main">
      <div className="developer-top">
        <a href="/">
          <ArrowLeft size={14} />
          Run Notes
        </a>
        <span className="eyebrow">РАБОЧАЯ СРЕДА РАЗРАБОТЧИКА</span>
        <button className="button primary" onClick={exportWorkspace}>
          <Download size={14} />
          Workspace для MCP
        </button>
      </div>
      <h1>Training и A/B</h1>
      <p className="developer-lead">
        Проверить выгрузку, сравнить данные и передать выбранный контекст
        AI-клиенту через MCP.
      </p>
      <div className="notice">
        <Info size={16} />
        <span>
          На этой странице файлы обрабатываются в памяти браузера и не
          отправляются на сервер. Для корпоративной работы используйте
          разрешённый контур и AI-клиент, запущенный через корпоративный
          launcher. Публичные примеры искусственные.
        </span>
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="Тип данных">
        <button
          role="tab"
          aria-selected={tab === "training"}
          onClick={() => setTab("training")}
        >
          Training · скаляры
        </button>
        <button
          role="tab"
          aria-selected={tab === "ab"}
          onClick={() => setTab("ab")}
        >
          Online · A/B
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="developer-source">
        {tab === "training" ? trainingSource : abSource}
      </div>
      {tab === "training" ? (
        <>
          <section className="panel developer-section">
            <div className="panel-heading">
              <h2>Экспорты скалярных графиков</h2>
              <button className="button" onClick={() => file.current?.click()}>
                <Upload size={14} />
                Добавить JSON
              </button>
              <input
                hidden
                ref={file}
                type="file"
                multiple
                accept=".json"
                onChange={(e) => importTraining(e.target.files)}
              />
            </div>
            <div className="developer-content">
              <p>
                Один файл — один экспорт: массив серий{" "}
                <code>{"{name, points: [{s, t, v}]}"}</code>. Выгружайте без
                preview и сглаживания, по оси Step. После загрузки выберите
                только разрешённые метрики. Имена файлов и служебные ID не
                включаются в workspace.
              </p>
              <div className="developer-fields">
                <label>
                  Псевдоним датасета
                  <input
                    value={dataset}
                    maxLength={100}
                    onChange={(e) => setDataset(e.target.value)}
                  />
                </label>
                <label>
                  Протокол оценки
                  <input
                    value={protocol}
                    maxLength={100}
                    onChange={(e) => setProtocol(e.target.value)}
                  />
                </label>
              </div>
              <label className="developer-check">
                <input
                  type="checkbox"
                  checked={sameProtocol}
                  onChange={(e) => setSameProtocol(e.target.checked)}
                />
                У всех выбранных экспортов одинаковые датасет и протокол оценки
              </label>
              <div className="developer-choice">
                <div>
                  <h3>Экспорты</h3>
                  {workspace.training.map((r) => (
                    <label className="developer-check" key={r.id}>
                      <input
                        type="checkbox"
                        checked={ids.includes(r.id)}
                        onChange={() =>
                          setIds((p) =>
                            p.includes(r.id)
                              ? p.filter((x) => x !== r.id)
                              : [...p, r.id],
                          )
                        }
                      />
                      {r.id}
                      <small>{r.series.length} серий</small>
                    </label>
                  ))}
                </div>
                <div>
                  <h3>Метрики для сравнения и MCP</h3>
                  {names.map((n) => (
                    <label className="developer-check" key={n}>
                      <input
                        type="checkbox"
                        checked={metrics.includes(n)}
                        onChange={() =>
                          setMetrics((p) =>
                            p.includes(n)
                              ? p.filter((x) => x !== n)
                              : [...p, n],
                          )
                        }
                      />
                      <span>{n}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="developer-check">
                <input
                  type="checkbox"
                  checked={includeTime}
                  onChange={(e) => setIncludeTime(e.target.checked)}
                />
                Включать время точек t в скачиваемый workspace
              </label>
            </div>
          </section>
          <section className="panel developer-section">
            <div className="panel-heading">
              <h2>Один полный общий шаг</h2>
              {comparison.data && (
                <span className="mono">
                  Step {comparison.data.comparison_step}
                </span>
              )}
            </div>
            <div className="developer-content">
              {comparison.data ? (
                <>
                  <p>
                    Baseline: <code>{comparison.data.baseline_id}</code>. Общих
                    полных шагов: {comparison.data.common_steps_count}.
                    Последние точки разных запусков и лучшие значения разных
                    эпох не смешиваются.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Экспорт</th>
                          <th>Метрика</th>
                          <th>Значение</th>
                          <th>Разница к baseline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.data.rows.flatMap((r) =>
                          r.metrics.map((m) => (
                            <tr key={r.id + m.name}>
                              <td>{r.id}</td>
                              <td>{m.name}</td>
                              <td className="mono">{fmt(m.value)}</td>
                              <td className="mono">{fmt(m.delta)}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p>{comparison.data.caveat}</p>
                </>
              ) : (
                <p>{comparison.error}</p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="panel developer-section">
          <div className="panel-heading">
            <h2>Агрегированный A/B-отчёт</h2>
            <button className="button" onClick={() => abFile.current?.click()}>
              <Upload size={14} />
              Импорт JSON
            </button>
            <input
              hidden
              ref={abFile}
              type="file"
              accept=".json"
              onChange={(e) => importAB(e.target.files?.[0])}
            />
          </div>
          <div className="developer-content">
            <p>
              Портативный формат хранит контроль, тест, срез, период,
              направление метрики и единицы доверительного интервала. Это импорт
              готового отчёта, а не прямое подключение к внутренней A/B-системе.
            </p>
            {ab && abResult ? (
              <>
                <div className="developer-fields">
                  <label>
                    Отчёт
                    <select
                      value={ab.id}
                      onChange={(e) => setAbId(e.target.value)}
                    >
                      {workspace.ab.map((r) => (
                        <option key={r.id}>{r.id}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button"
                    onClick={() =>
                      save("ab-example.json", DEMO_WORKSPACE.ab[0])
                    }
                  >
                    <FileJson size={14} />
                    Шаблон формата
                  </button>
                </div>
                <p>
                  {ab.control_group} → {ab.treatment_group} · {ab.slice} ·{" "}
                  {ab.period_start} — {ab.period_end} ·{" "}
                  {ab.status === "interim"
                    ? "промежуточный срез"
                    : "финальный отчёт"}
                </p>
                {abResult.degraded_guardrails.length > 0 && (
                  <div className="notice error">
                    Ухудшены guardrail-метрики:{" "}
                    {abResult.degraded_guardrails.join(", ")}. Рост целевой
                    метрики не даёт основания для автоматической раскатки.
                  </div>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Метрика / роль</th>
                        <th>Контроль</th>
                        <th>Тест</th>
                        <th>Изменение</th>
                        <th>ДИ из отчёта</th>
                        <th>Сигнал</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abResult.metrics.map((m) => (
                        <tr key={m.metric}>
                          <td>
                            {m.metric}
                            <br />
                            <small>
                              {m.role} ·{" "}
                              {m.direction === "max"
                                ? "больше лучше"
                                : "меньше лучше"}
                            </small>
                          </td>
                          <td>{fmt(m.control)}</td>
                          <td>{fmt(m.treatment)}</td>
                          <td>
                            {m.relative_change_percent === null
                              ? "—"
                              : fmt(m.relative_change_percent) + "%"}
                          </td>
                          <td>
                            {fmt(m.ci_low)}…{fmt(m.ci_high)}{" "}
                            {m.ci_unit === "relative_percent"
                              ? "%"
                              : "абс. разницы"}
                            <br />
                            <small>{fmt(m.confidence * 100)}% ДИ</small>
                          </td>
                          <td>
                            {m.signal === "improvement"
                              ? "улучшение"
                              : m.signal === "degradation"
                                ? "ухудшение"
                                : "неопределённо"}
                            {m.warning && (
                              <>
                                <br />
                                <small>{m.warning}</small>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Коррекция множественных сравнений:{" "}
                  {ab.multiplicity === "adjusted"
                    ? "учтена в отчёте"
                    : ab.multiplicity === "not_adjusted"
                      ? "не применялась"
                      : "не указана"}
                  . {abResult.caveat}
                </p>
              </>
            ) : (
              <p>Нет A/B-отчётов.</p>
            )}
          </div>
        </section>
      )}
      <section className="panel developer-section">
        <div className="panel-heading">
          <div className="panel-title">
            <Terminal size={16} />
            <h2>Разбор моделью через MCP</h2>
          </div>
          <a
            href="https://github.com/RahimGulyamov/ml-experiment-assistant/blob/main/docs/launcher.md"
            target="_blank"
            rel="noreferrer"
          >
            Инструкция →
          </a>
        </div>
        <div className="developer-content">
          <p>
            Скачайте выбранный workspace. Локальный MCP-сервер отдаёт только
            содержимое указанного файла. Подключите его к AI-клиенту, который
            запускаете через корпоративный launcher. Авторизация модели остаётся
            в этом клиенте; токены launcher не вводятся в публичный сайт.
          </p>
          <pre>
            npm run launcher:config -- --workspace
            /path/to/run-notes-workspace.json --codex
          </pre>
          <p>Запрос для AI-клиента:</p>
          <pre className="developer-prompt">
            {tab === "training"
              ? "Используй MCP run_notes. Сначала list_workspace_sources. Сравни выбранные Training-экспорты на одном полном общем шаге через compare_training_exports. Объясни ограничения и предложи следующий проверяемый шаг. Данные и выводы не публикуй."
              : "Используй MCP run_notes. Сначала list_workspace_sources. Вызови analyze_ab_result для выбранного A/B-отчёта. Проверь направление метрик, guardrails, период, срез, единицы ДИ и промежуточный статус. Объясни ограничения и предложи следующий проверяемый шаг. Данные и выводы не публикуй."}
          </pre>
          <p>
            Внутренние сетевые коннекторы Training и A/B не подключены
            автоматически. Для них нужны подтверждённые API-контракты и доступы
            внутри компании. Локальный stdio MCP и импорт выгрузок работают
            независимо от них.
          </p>
        </div>
      </section>
    </main>
  );
}
