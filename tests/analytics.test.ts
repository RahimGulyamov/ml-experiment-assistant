import { describe, it, expect } from "vitest";
import { compareRuns, diagnoseRun } from "../lib/experiments/analytics";
import { DEMO_RUNS } from "../lib/experiments/demo";
import { runsSchema } from "../lib/experiments/schema";
const run = (id: string, value: number) => ({
  ...DEMO_RUNS[0],
  id,
  metrics: { score: value },
});
describe("comparison", () => {
  it("ranks descending and computes signed delta and improvement", () => {
    const c = compareRuns(
      [run("a", 0.8), run("b", 0.9)],
      ["a", "b"],
      "score",
      "max",
    );
    expect(c.winner_id).toBe("b");
    expect(c.ranking[0].improvement_from_baseline).toBeCloseTo(0.1);
    expect(c.ranking[0].relative_change_percent).toBeCloseTo(12.5);
  });
  it("minimizes loss with positive improvement", () => {
    const c = compareRuns(
      [run("a", 0.4), run("b", 0.2)],
      ["a", "b"],
      "score",
      "min",
    );
    expect(c.winner_id).toBe("b");
    expect(c.ranking[0].delta_from_baseline).toBeCloseTo(-0.2);
    expect(c.ranking[0].improvement_from_baseline).toBeCloseTo(0.2);
  });
  it("uses first eligible input ID as baseline, not best or sorted ID", () => {
    const c = compareRuns(
      [run("a", 3), run("b", 7)],
      ["b", "a"],
      "score",
      "max",
    );
    expect(c.baseline_id).toBe("b");
    expect(c.ranking[1].delta_from_baseline).toBe(-4);
  });
  it("reports ties without inventing a unique winner", () => {
    const c = compareRuns(
      [run("b", 1), run("a", 1)],
      ["b", "a"],
      "score",
      "max",
    );
    expect(c.tied_best_ids).toEqual(["a", "b"]);
  });
  it("handles a zero baseline without Infinity", () => {
    const c = compareRuns(
      [run("a", 0), run("b", 1)],
      ["a", "b"],
      "score",
      "max",
    );
    expect(c.ranking[0].relative_change_percent).toBeNull();
  });
  it("excludes failed runs and missing metrics", () => {
    const c = compareRuns(
      [
        { ...run("a", 100), status: "failed" },
        run("b", 1),
        { ...run("c", 0), metrics: {} },
      ],
      ["a", "b", "c"],
      "score",
      "max",
    );
    expect(c.winner_id).toBe("b");
    expect(c.excluded).toHaveLength(2);
  });
  it("rejects incompatible splits even with identical metric names", () => {
    expect(() =>
      compareRuns(
        [run("a", 1), { ...run("b", 2), split: "test" }],
        ["a", "b"],
        "score",
        "max",
      ),
    ).toThrow("experiment/dataset/split");
  });
  it("rejects ambiguous repeated IDs and unknown runs", () => {
    expect(() =>
      compareRuns([run("a", 1)], ["a", "a"], "score", "max"),
    ).toThrow();
    expect(() =>
      compareRuns([run("a", 1)], ["missing"], "score", "max"),
    ).toThrow("не найден");
  });
  it("returns no winner if nothing eligible", () =>
    expect(
      compareRuns(
        [{ ...run("a", 1), status: "running" }],
        ["a"],
        "score",
        "max",
      ).winner_id,
    ).toBeNull());
  it("does not mistake Object.prototype properties for recorded metrics", () => {
    const c = compareRuns([run("a", 1)], ["a"], "toString", "max");
    expect(c.winner_id).toBeNull();
    expect(c.excluded).toHaveLength(1);
  });
});
describe("diagnostics and schema", () => {
  it("detects designed overfitting but not ordinary decreasing loss", () => {
    expect(diagnoseRun(DEMO_RUNS[3]).signal).toBe("possible_overfitting");
    expect(diagnoseRun(DEMO_RUNS[4]).signal).toBe("no_clear_signal");
  });
  it("does not claim absence with missing history", () =>
    expect(diagnoseRun({ ...DEMO_RUNS[0], history: [] }).signal).toBe(
      "insufficient_history",
    ));
  it("validates synthetic dataset", () =>
    expect(runsSchema.parse(DEMO_RUNS)).toHaveLength(8));
  it("rejects NaN, Infinity and duplicate IDs", () => {
    expect(() => runsSchema.parse([run("a", NaN)])).toThrow();
    expect(() => runsSchema.parse([run("a", Infinity)])).toThrow();
    expect(() => runsSchema.parse([run("a", 1), run("a", 2)])).toThrow(
      "Повторяется ID",
    );
  });
  it("rejects unordered history and more than 200 runs", () => {
    expect(() =>
      runsSchema.parse([
        {
          ...run("a", 1),
          history: [
            { step: 2, train_loss: 1, val_loss: 1 },
            { step: 1, train_loss: 1, val_loss: 1 },
          ],
        },
      ]),
    ).toThrow("возрастать");
    expect(() =>
      runsSchema.parse(Array.from({ length: 201 }, (_, i) => run(`r${i}`, i))),
    ).toThrow();
  });
});
