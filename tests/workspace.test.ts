import { describe, it, expect } from "vitest";
import { DEMO_WORKSPACE } from "../lib/workspace/demo";
import {
  workspaceSchema,
  parseTrainingExport,
  compareTraining,
  summarizeAB,
} from "../lib/workspace/data";
describe("training scalar exports", () => {
  it("reads s/t/v without assuming completion and sorts exact steps", () => {
    const r = parseTrainingExport(
      '[{"name":"val/quality","points":[{"s":20,"t":"2026-01-01T00:02:00Z","v":0.9},{"s":10,"v":0.7}]}]',
    );
    expect(r[0].points.map((p) => p.s)).toEqual([10, 20]);
  });
  it("compares at last complete common step rather than each run maximum", () => {
    const r = compareTraining(
      DEMO_WORKSPACE.training,
      ["training-a", "training-b"],
      ["val/quality", "val/loss"],
    );
    expect(r.comparison_step).toBe(200);
    expect(r.rows[0].metrics[0].value).toBe(0.75);
    expect(r.rows[1].metrics[0].delta).toBeCloseTo(0.04);
  });
  it("rejects missing full common steps and incompatible protocols", () => {
    expect(() =>
      compareTraining(
        DEMO_WORKSPACE.training,
        ["training-a", "training-b"],
        ["val/quality"],
        300,
      ),
    ).toThrow("общего шага");
    expect(() =>
      compareTraining(
        [
          DEMO_WORKSPACE.training[0],
          { ...DEMO_WORKSPACE.training[1], protocol: "another-grid" },
        ],
        ["training-a", "training-b"],
        ["val/quality"],
      ),
    ).toThrow("протокол");
  });
  it("rejects duplicate steps, names and IDs", () => {
    expect(() =>
      parseTrainingExport(
        '[{"name":"x","points":[{"s":1,"v":1},{"s":1,"v":2}]}]',
      ),
    ).toThrow("Повторяется шаг");
    expect(() =>
      workspaceSchema.parse({
        ...DEMO_WORKSPACE,
        training: [DEMO_WORKSPACE.training[0], DEMO_WORKSPACE.training[0]],
      }),
    ).toThrow();
  });
});
describe("A/B aggregate reports", () => {
  it("flags a guardrail despite improved primary metric", () => {
    const r = summarizeAB(DEMO_WORKSPACE.ab[0]);
    expect(r.decision).toBe("guardrail_violation");
    expect(r.metrics[0].relative_change_percent).toBeCloseTo(2);
    expect(r.degraded_guardrails).toEqual(["negative_feedback"]);
  });
  it("keeps a CI crossing zero inconclusive and supports minimizing", () => {
    const a = structuredClone(DEMO_WORKSPACE.ab[0]);
    a.metrics[0].ci_low = -1;
    expect(summarizeAB(a).metrics[0].signal).toBe("inconclusive");
    a.metrics[1].ci_low = -30;
    a.metrics[1].ci_high = -10;
    expect(summarizeAB(a).metrics[1].signal).toBe("improvement");
  });
  it("does not compute a relative change from a zero baseline", () => {
    const a = structuredClone(DEMO_WORKSPACE.ab[0]);
    a.metrics[0].control = 0;
    expect(summarizeAB(a).metrics[0].relative_change_percent).toBeNull();
  });
  it("rejects invalid CI order, period and identical groups", () => {
    const a = structuredClone(DEMO_WORKSPACE);
    a.ab[0].metrics[0].ci_low = 10;
    expect(() => workspaceSchema.parse(a)).toThrow();
    expect(() =>
      workspaceSchema.parse({
        ...DEMO_WORKSPACE,
        ab: [{ ...DEMO_WORKSPACE.ab[0], period_start: "2026-02-01" }],
      }),
    ).toThrow();
    expect(() =>
      workspaceSchema.parse({
        ...DEMO_WORKSPACE,
        ab: [{ ...DEMO_WORKSPACE.ab[0], treatment_group: "A" }],
      }),
    ).toThrow();
  });
});
it("keeps intraday timezone boundaries and compares their actual instants", () => {
  const ab = {
    ...DEMO_WORKSPACE.ab[0],
    period_start: "2026-01-01T10:00:00+03:00",
    period_end: "2026-01-01T08:00:00Z",
  };
  expect(
    workspaceSchema.parse({ ...DEMO_WORKSPACE, ab: [ab] }).ab[0].period_start,
  ).toBe(ab.period_start);
  expect(() =>
    workspaceSchema.parse({
      ...DEMO_WORKSPACE,
      ab: [{ ...ab, period_end: "2026-01-01T06:00:00Z" }],
    }),
  ).toThrow();
});
it("does not interpret a relative CI with a zero control", () => {
  const ab = structuredClone(DEMO_WORKSPACE.ab[0]);
  ab.metrics[0].control = 0;
  const row = summarizeAB(ab).metrics[0];
  expect(row.signal).toBe("inconclusive");
  expect(row.warning).toContain("нулевом");
});
it("exports only selected Training metrics, omitting time and unrelated A/B", async () => {
  const { prepareWorkspace } = await import("../lib/workspace/data");
  const source = structuredClone(DEMO_WORKSPACE);
  source.training[0].series[0].points[0].t = "2026-01-01T00:00:00Z";
  const out = prepareWorkspace(source, {
    kind: "training",
    exportIds: ["training-a"],
    metrics: ["val/quality"],
    dataset: "alias-1",
    protocol: "eval-1",
    includeTime: false,
  });
  expect(out.ab).toEqual([]);
  expect(out.training).toHaveLength(1);
  expect(out.training[0].series).toHaveLength(1);
  expect(out.training[0].series[0].points[0]).not.toHaveProperty("t");
  expect(out.training[0].dataset).toBe("alias-1");
});
it("exports only the selected A/B report without Training data", async () => {
  const { prepareWorkspace } = await import("../lib/workspace/data");
  const out = prepareWorkspace(DEMO_WORKSPACE, {
    kind: "ab",
    exportIds: [],
    metrics: [],
    dataset: "",
    protocol: "",
    includeTime: false,
    abId: "ab-demo",
  });
  expect(out.training).toEqual([]);
  expect(out.ab.map((r) => r.id)).toEqual(["ab-demo"]);
});

it("checks the actual formatted download size so stdio can read the exported file", async () => {
  const { assertWorkspaceSize } = await import("../lib/workspace/data");
  const points = Array.from({ length: 5000 }, (_, i) => ({
    s: i,
    v: 0.7,
    t: "x".repeat(70),
  }));
  const workspace = {
    version: 1 as const,
    ab: [],
    training: [
      {
        ...DEMO_WORKSPACE.training[0],
        series: ["a", "b", "c"].map((name) => ({ name, points })),
      },
    ],
  };
  expect(Buffer.byteLength(JSON.stringify(workspace))).toBeLessThan(
    2 * 1024 * 1024,
  );
  expect(Buffer.byteLength(JSON.stringify(workspace, null, 2))).toBeGreaterThan(
    2 * 1024 * 1024,
  );
  expect(() => assertWorkspaceSize(workspace)).toThrow("2 MiB");
});
