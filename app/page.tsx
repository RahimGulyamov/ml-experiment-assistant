"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FlaskConical,
  Info,
  LoaderCircle,
  MessageSquare,
  Plus,
  RotateCcw,
  Settings2,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { DEMO_LABEL, DEMO_RUNS } from "@/lib/experiments/demo";
import { parseImport } from "@/lib/experiments/import";
import { compareRuns, diagnoseRun } from "@/lib/experiments/analytics";
import {
  groupKey,
  MAX_BYTES,
  validationMessage,
  type Direction,
  type Run,
} from "@/lib/experiments/schema";
import type { AnalysisResult } from "@/lib/agent";

const COLORS = ["#267566", "#b77a30", "#6d7fba", "#c16d60"];
const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(n);
function download(
  name: string,
  text: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LossChart({ run }: { run: Run | undefined }) {
  const h = run?.history || [];
  const max =
    Math.max(...h.flatMap((p) => [p.train_loss, p.val_loss]), 0.1) * 1.08;
  const x = (s: number) =>
    45 +
    ((s - (h[0]?.step || 0)) /
      Math.max(1, (h.at(-1)?.step || 1) - (h[0]?.step || 0))) *
      600;
  const y = (v: number) => 165 - (v / max) * 140;
  return (
    <div className="chart-wrap">
      {h.length ? (
        <svg
          viewBox="0 0 670 200"
          role="img"
          aria-label={`Train и validation loss для ${run?.id}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line
                x1="45"
                y1={y(max * f)}
                x2="645"
                y2={y(max * f)}
                stroke="#e9ece8"
                strokeDasharray="3 4"
              />
              <text x="32" y={y(max * f) + 4} textAnchor="end">
                {(max * f).toFixed(2)}
              </text>
            </g>
          ))}
          {[h[0], h[Math.floor((h.length - 1) / 2)], h.at(-1)]
            .filter(Boolean)
            .map((p, i) => (
              <text key={i} x={x(p!.step)} y="186" textAnchor="middle">
                {p!.step}
              </text>
            ))}
          <polyline
            points={h.map((p) => `${x(p.step)},${y(p.train_loss)}`).join(" ")}
            fill="none"
            stroke="#267566"
            strokeWidth="2.5"
          />
          <polyline
            points={h.map((p) => `${x(p.step)},${y(p.val_loss)}`).join(" ")}
            fill="none"
            stroke="#b77a30"
            strokeWidth="2.5"
          />
          <circle
            cx={x(h.at(-1)!.step)}
            cy={y(h.at(-1)!.val_loss)}
            r="4"
            fill="#b77a30"
          />
          <text x="645" y="199" textAnchor="end">
            шаг обучения
          </text>
        </svg>
      ) : (
        <div className="chart-empty">
          <Info size={20} />
          <p>В этом запуске нет истории loss.</p>
          <small>
            Добавьте history в JSON. В CSV доступны итоговые метрики.
          </small>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [runs, setRuns] = useState<Run[]>(DEMO_RUNS);
  const [source, setSource] = useState(DEMO_LABEL);
  const [group, setGroup] = useState(groupKey(DEMO_RUNS[0]));
  const [selected, setSelected] = useState(
    new Set(["run-001", "run-003", "run-004", "run-005"]),
  );
  const [metric, setMetric] = useState("accuracy");
  const [direction, setDirection] = useState<Direction>("max");
  const [focused, setFocused] = useState("run-004");
  const [settings, setSettings] = useState(false);
  const [provider, setProvider] = useState<"openai" | "openrouter">("openai");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [key, setKey] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const active = runs.filter((r) => groupKey(r) === group);
  const chosen = active.filter((r) => selected.has(r.id));
  const groups = useMemo(
    () => Array.from(new Map(runs.map((r) => [groupKey(r), r])).entries()),
    [runs],
  );
  const metrics = Array.from(
    new Set(active.flatMap((r) => Object.keys(r.metrics))),
  );
  const ranked = compareRuns(
    active,
    active.map((r) => r.id),
    metric,
    direction,
  );
  const best = ranked.ranking[0];
  const tiedBest = new Set(ranked.tied_best_ids);
  const focus = active.find((r) => r.id === focused) || active[0];
  const risk = active.filter(
    (r) =>
      r.status === "finished" &&
      diagnoseRun(r).signal === "possible_overfitting",
  ).length;
  const scope = JSON.stringify([runs, group, [...selected], metric, direction]);

  // A result is valid only for the data and selection used in its request.
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
    setLastQuestion("");
  }, [scope]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const d = dialogRef.current;
    if (settings && !d?.open) d?.showModal();
    if (!settings && d?.open) d.close();
  }, [settings]);

  function install(next: Run[], label: string) {
    controller.current?.abort();
    setRuns(next);
    setSource(label);
    setGroup(groupKey(next[0]));
    const inGroup = next.filter((r) => groupKey(r) === groupKey(next[0]));
    setSelected(new Set(inGroup.map((r) => r.id)));
    setFocused(inGroup[0].id);
    const m = Object.keys(inGroup[0].metrics)[0] || "accuracy";
    setMetric(m);
    setDirection(/loss|error|mse|mae|rmse/i.test(m) ? "min" : "max");
    setNotice(
      "Данные загружены. Проверьте направление метрики перед сравнением.",
    );
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > MAX_BYTES) throw new Error("Файл больше 2 MiB");
      install(parseImport(await file.text(), file.name), file.name);
      setError("");
    } catch (e) {
      setError(validationMessage(e));
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function loadMeasured() {
    try {
      const res = await fetch("/examples/measured-iris.json");
      if (!res.ok) throw new Error("Не удалось загрузить пример Iris");
      install(
        parseImport(await res.text(), "measured-iris.json"),
        "Iris · реальные измерения обучения",
      );
    } catch (e) {
      setError(validationMessage(e));
    }
  }
  function changeGroup(value: string) {
    setGroup(value);
    const next = runs.filter((r) => groupKey(r) === value);
    setSelected(new Set(next.map((r) => r.id)));
    setFocused(next[0].id);
    setMetric(Object.keys(next[0].metrics)[0] || "accuracy");
  }
  async function analyze(mode: "overview" | "llm", prompt = question) {
    setError("");
    setNotice("");
    if (!chosen.length) {
      setError("Выберите хотя бы один запуск.");
      return;
    }
    if (mode === "llm" && !key) {
      setSettings(true);
      return;
    }
    if (mode === "llm" && !prompt.trim()) {
      setError("Введите вопрос к экспериментам.");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setResult(null);
    setLastQuestion(mode === "llm" ? prompt : "");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          runs: chosen,
          metric,
          direction,
          mode,
          ...(mode === "llm"
            ? { provider, model, apiKey: key, question: prompt.trim() }
            : {}),
        }),
      });
      const data = (await res.json()) as AnalysisResult & { error?: string };
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      if (!abort.signal.aborted) setResult(data);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Не удалось получить ответ");
    } finally {
      if (controller.current === abort) setBusy(false);
    }
  }
  function exportReport() {
    if (!result) return;
    const text = [
      "# Run Notes — отчёт",
      `Дата: ${new Date().toISOString()}`,
      `Источник: ${source}`,
      `Выборка: ${chosen.map((r) => r.id).join(", ")}`,
      `Метрика: ${metric}; направление: ${direction}`,
      `Режим: ${result.mode === "llm" ? `LLM (${result.model})` : "Расчётный, без LLM"}`,
      lastQuestion ? `Вопрос: ${lastQuestion}` : "",
      "## Вывод",
      result.answer,
      "",
      "## Проверяемые данные MCP",
      "```json",
      JSON.stringify(result.trace, null, 2),
      "```",
      "",
      "Результат требует проверки человеком. Один запуск не доказывает причинность или значимость.",
    ].join("\n");
    download("run-notes-report.md", text, "text/markdown;charset=utf-8");
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Run Notes, главная">
          <span className="brand-mark">
            r<span>n</span>
          </span>
          <strong>
            run notes<span className="brand-dot">.</span>
          </strong>
        </a>
        <nav aria-label="Основная навигация">
          <span className="nav-current">Эксперименты</span>
          <a href="/guide">Как работать</a>
          <a href="/developer">Training и A/B</a>
          <a href="/presentation">
            О проекте <ArrowUpRight size={13} />
          </a>
        </nav>
        <button
          className="button settings-button"
          aria-label="Подключить LLM"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={15} />
          <span>Подключить LLM</span>
          <span className={key ? "status-dot on" : "status-dot"} />
        </button>
      </header>
      <main className="workspace">
        <div className="breadcrumb">
          <FlaskConical size={14} /> Лаборатория <span>/</span> Анализ запусков
        </div>
        <div className="page-heading">
          <div>
            <div className="eyebrow">АССИСТЕНТ АНАЛИЗА ML-ЭКСПЕРИМЕНТОВ</div>
            <h1>Сравнение запусков</h1>
            <p>Метрики и история обучения — в одном контексте.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button"
              onClick={() => install(DEMO_RUNS, DEMO_LABEL)}
              title="Вернуть учебный набор"
            >
              <RotateCcw size={14} />
              Пример
            </button>
            <button
              className="button primary"
              onClick={() => fileRef.current?.click()}
            >
              <Plus size={16} />
              Импорт данных
            </button>
            <input
              hidden
              ref={fileRef}
              type="file"
              accept=".json,.csv"
              onChange={(e) => importFile(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="source-line">
          <span className="source-tag">
            <span className="status-dot on" />
            {source}
          </span>
          <span>Данные хранятся в памяти вкладки</span>
          <button className="source-example" onClick={loadMeasured}>
            Загрузить замеры Iris <ArrowUpRight size={11} />
          </button>
        </div>
        <div className="stats">
          <div className="stat">
            <span>Запусков в группе</span>
            <div>
              {active.length}
              <small>
                {active.filter((r) => r.status === "finished").length} завершено
              </small>
            </div>
          </div>
          <div className="stat">
            <span>
              Лучшее значение <span className="mono">{metric}</span>
            </span>
            <div>
              {best ? fmt(best.value) : "—"}
              <small className="green">
                {ranked.tied_best_ids.length > 1
                  ? `${ranked.tied_best_ids.length} запуска с одинаковым значением`
                  : best?.id || "нет данных"}
              </small>
            </div>
          </div>
          <div className="stat">
            <span>Признаки переобучения</span>
            <div>
              {risk}
              <small>
                {risk ? "проверить историю loss" : "явного сигнала нет"}
              </small>
            </div>
          </div>
          <div className="stat">
            <span>В контексте ассистента</span>
            <div>
              {chosen.length}
              <small>из {active.length} запусков</small>
            </div>
          </div>
        </div>
        {(error || notice) && (
          <div
            className={error ? "notice error" : "notice"}
            role={error ? "alert" : "status"}
          >
            <Info size={16} />
            <span>{error || notice}</span>
            <button
              aria-label="Скрыть сообщение"
              onClick={() => {
                setError("");
                setNotice("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="work-grid">
          <section className="data-column" aria-label="Данные экспериментов">
            <div className="panel runs-panel">
              <div className="panel-heading">
                <div className="panel-title">
                  <h2>Запуски</h2>
                  <span className="count">{active.length}</span>
                </div>
                <label className="group-select">
                  <span className="sr-only">Группа сравнения</span>
                  <select
                    value={group}
                    onChange={(e) => changeGroup(e.target.value)}
                  >
                    {groups.map(([g, r]) => (
                      <option key={g} value={g}>
                        {r.experiment} / {r.dataset} / {r.split}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
              <div className="table-toolbar">
                <label>
                  Метрика{" "}
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                  >
                    {metrics.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                    {!metrics.length && (
                      <option value="accuracy">нет метрик</option>
                    )}
                  </select>
                </label>
                <button
                  className="direction"
                  onClick={() =>
                    setDirection((d) => (d === "max" ? "min" : "max"))
                  }
                  title="Изменить направление метрики"
                >
                  {direction === "max" ? (
                    <ArrowUp size={13} />
                  ) : (
                    <ArrowDown size={13} />
                  )}{" "}
                  {direction === "max" ? "Больше — лучше" : "Меньше — лучше"}
                </button>
                <span className="table-hint">Baseline: первый выбранный</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <input
                          aria-label="Выбрать все запуски"
                          type="checkbox"
                          checked={chosen.length === active.length}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(active.map((r) => r.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th>Запуск</th>
                      <th className="number">{metric}</th>
                      <th className="number">Время</th>
                      <th className="state-cell">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((r, i) => (
                      <tr
                        key={r.id}
                        className={selected.has(r.id) ? "selected" : ""}
                      >
                        <td className="check-cell">
                          <input
                            aria-label={`Выбрать ${r.id}`}
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const n = new Set(prev);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="run-name"
                            onClick={() => setFocused(r.id)}
                          >
                            <span className="run-id">
                              <span
                                className="run-color"
                                style={{ background: COLORS[i % 4] }}
                              />
                              {r.id}
                              {tiedBest.has(r.id) && (
                                <span className="best-label">
                                  {tiedBest.size > 1 ? "= лучшее" : "лучший"}
                                </span>
                              )}
                            </span>
                            <span>{r.name}</span>
                          </button>
                        </td>
                        <td
                          className={
                            tiedBest.has(r.id) ? "number metric-best" : "number"
                          }
                        >
                          {r.metrics[metric] === undefined
                            ? "—"
                            : fmt(r.metrics[metric])}
                        </td>
                        <td className="number time">
                          {r.duration_seconds === undefined
                            ? "—"
                            : `${fmt(r.duration_seconds)} с`}
                        </td>
                        <td className="state-cell">
                          <span className={`run-status ${r.status}`}>
                            {r.status === "finished" ? (
                              <Check size={12} />
                            ) : r.status === "failed" ? (
                              <X size={12} />
                            ) : (
                              <LoaderCircle size={12} />
                            )}
                            <span>
                              {r.status === "finished"
                                ? "Готов"
                                : r.status === "failed"
                                  ? "Ошибка"
                                  : "В работе"}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>{chosen.length} выбрано · одна группа сравнения</span>
                <button
                  onClick={() =>
                    download(
                      "experiments.json",
                      JSON.stringify(runs, null, 2),
                      "application/json",
                    )
                  }
                >
                  <Download size={13} />
                  JSON
                </button>
              </div>
            </div>
            <div className="panel history-panel">
              <div className="panel-heading">
                <h2>История обучения</h2>
                <label className="history-select">
                  <span className="sr-only">Запуск для графика</span>
                  <select
                    value={focus?.id || ""}
                    onChange={(e) => setFocused(e.target.value)}
                  >
                    {active.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chart-legend">
                <span>
                  <i style={{ background: "#267566" }} />
                  train loss
                </span>
                <span>
                  <i style={{ background: "#b77a30" }} />
                  validation loss
                </span>
                {focus &&
                  diagnoseRun(focus).signal === "possible_overfitting" && (
                    <span className="risk-label">Возможное переобучение</span>
                  )}
              </div>
              <LossChart run={focus} />
              <div className="chart-caption">
                {focus?.name} · {focus?.history.length || 0} точек · эвристика
                по loss не заменяет проверку на новых данных
              </div>
            </div>
          </section>
          <section className="panel assistant-panel" aria-label="Ассистент">
            <div className="panel-heading">
              <div className="panel-title">
                <MessageSquare size={17} />
                <h2>Разбор экспериментов</h2>
              </div>
              <span className={key ? "mode-tag connected" : "mode-tag"}>
                {key ? "Ключ задан" : "Без LLM"}
              </span>
            </div>
            <div className="assistant-body" aria-live="polite" aria-busy={busy}>
              {busy ? (
                <div className="analyzing">
                  <LoaderCircle className="spin" size={24} />
                  <strong>
                    {key && lastQuestion
                      ? "Модель проверяет данные"
                      : "Считаем через MCP"}
                  </strong>
                  <p>Запрос может занять до 90 секунд.</p>
                  <button
                    className="button"
                    onClick={() => {
                      controller.current?.abort();
                      setBusy(false);
                    }}
                  >
                    Отменить
                  </button>
                </div>
              ) : result ? (
                <>
                  {lastQuestion && (
                    <div className="user-question">{lastQuestion}</div>
                  )}
                  <div className="answer-label">
                    <span className="status-dot on" />
                    {result.mode === "llm"
                      ? result.model
                      : "Расчётный обзор · без LLM"}
                  </div>
                  <div className="answer-text">{result.answer}</div>
                  {result.warning && (
                    <p className="inline-warning">{result.warning}</p>
                  )}
                  <details className="trace">
                    <summary>
                      <Terminal size={14} />
                      MCP: {result.trace.length} вызовов{" "}
                      <ChevronDown size={13} />
                    </summary>
                    <div className="trace-content">
                      <p>
                        Реальные ответы инструментов. Числа в тексте модели
                        нужно сверять с ними.
                      </p>
                      {result.trace.map((t, i) => (
                        <details key={i}>
                          <summary>
                            <span>{String(i + 1).padStart(2, "0")}</span>{" "}
                            {t.name}{" "}
                            <small>
                              {t.duration_ms} ms {t.isError ? "· ошибка" : ""}
                            </small>
                          </summary>
                          <pre>
                            {JSON.stringify(
                              { arguments: t.arguments, result: t.result },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      ))}
                    </div>
                  </details>
                  <button
                    className="button report-button"
                    onClick={exportReport}
                  >
                    <Download size={14} />
                    Скачать отчёт .md
                  </button>
                </>
              ) : (
                <div className="assistant-empty">
                  <div className="empty-mark">
                    <Terminal size={24} />
                  </div>
                  <h3>Начните с вопроса к данным</h3>
                  <p>
                    Ассистент сравнит выбранные запуски, проверит историю и
                    предложит следующий эксперимент.
                  </p>
                  <div className="prompt-list">
                    {[
                      "Какой запуск лучше по выбранной метрике и почему?",
                      chosen.some((r) => r.id === "run-004")
                        ? "Есть ли признаки переобучения у run-004?"
                        : "Есть ли признаки переобучения у выбранных запусков?",
                      "Какой следующий эксперимент стоит провести?",
                    ].map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setQuestion(p);
                          if (key) analyze("llm", p);
                        }}
                      >
                        {p}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                  <div className="offline-note">
                    <Info size={15} />
                    <p>
                      Без ключа доступен расчётный обзор. Для свободных вопросов
                      подключите модель с поддержкой инструментов.
                    </p>
                  </div>
                  <button
                    className="button overview-button"
                    onClick={() => analyze("overview")}
                  >
                    <FlaskConical size={15} />
                    Сформировать обзор без LLM
                  </button>
                </div>
              )}
            </div>
            <div className="composer">
              <label className="sr-only" htmlFor="question">
                Вопрос к экспериментам
              </label>
              <textarea
                id="question"
                maxLength={2000}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (!busy) analyze("llm");
                  }
                }}
                placeholder="Например, стоит ли усложнять аугментации?"
              />
              <div className="composer-bottom">
                <span>
                  {chosen.length} запусков · {metric}{" "}
                  {direction === "max" ? "↑" : "↓"}
                </span>
                <button
                  className="send-button"
                  aria-label={key ? "Отправить вопрос" : "Подключить модель"}
                  disabled={busy}
                  onClick={() => analyze("llm")}
                >
                  {key ? <ArrowUp size={16} /> : <Settings2 size={16} />}
                </button>
              </div>
            </div>
            <div className="assistant-footnote">
              LLM может ошибаться. Проверяйте выводы по журналу MCP.
            </div>
          </section>
        </div>
        <footer className="page-footer">
          <span>Run Notes / личный проект · Гулямов Рахим</span>
          <div>
            <a href="/guide">Формат данных</a>
            <a href="/developer">Training и A/B</a>
            <a href="/presentation">
              Презентация <ArrowUpRight size={12} />
            </a>
            <a
              href="https://github.com/RahimGulyamov/ml-experiment-assistant"
              target="_blank"
              rel="noreferrer"
            >
              Исходный код <ArrowUpRight size={12} />
            </a>
          </div>
        </footer>
      </main>
      <dialog
        ref={dialogRef}
        onClose={() => setSettings(false)}
        onCancel={() => setSettings(false)}
        className="settings-dialog"
      >
        <div className="dialog-heading">
          <h2>Подключение модели</h2>
          <button
            aria-label="Закрыть настройки"
            onClick={() => setSettings(false)}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          Нужна модель с поддержкой tool calling. Ключ хранится только в памяти
          вкладки и передаётся серверу на время запроса.
        </p>
        <p>
          Ключ можно создать в{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            OpenAI Platform
          </a>
          . Подписка ChatGPT/Codex сама по себе не является API-ключом. Для
          локального AI-клиента доступен{" "}
          <a href="/developer">MCP без ключа сайта →</a>
        </p>
        <label>
          Провайдер
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as typeof provider;
              setProvider(p);
              setModel(p === "openai" ? "gpt-4.1-mini" : "openai/gpt-4.1-mini");
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          Модель
          <input
            value={model}
            maxLength={120}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4.1-mini"
            autoComplete="off"
          />
        </label>
        <label>
          API-ключ
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            maxLength={512}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Вставьте свой API-ключ"
          />
        </label>
        <div className="privacy-note">
          <Info size={16} />
          <span>
            При анализе выбранные метрики и параметры отправляются провайдеру
            LLM. Не загружайте секреты и персональные данные. Запросы
            оплачиваются по тарифу провайдера.
          </span>
        </div>
        <div className="dialog-actions">
          <button
            className="button"
            onClick={() => {
              setKey("");
              setSettings(false);
            }}
          >
            Удалить ключ
          </button>
          <button className="button primary" onClick={() => setSettings(false)}>
            Готово
          </button>
        </div>
        <small>
          Введённый ключ ещё не проверен. Проверка произойдёт при первом
          запросе.
        </small>
      </dialog>
    </>
  );
}
