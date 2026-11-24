import type { Workspace } from "./data";
// Synthetic fixtures only. No internal service identifiers or measured company data.
export const DEMO_WORKSPACE: Workspace = {
  version: 1,
  training: [
    {
      id: "training-a",
      experiment: "demo-models",
      dataset: "synthetic-v1",
      protocol: "evaluation-v1",
      series: [
        {
          name: "val/quality",
          points: [
            { s: 100, v: 0.7 },
            { s: 200, v: 0.75 },
            { s: 300, v: 0.78 },
          ],
        },
        {
          name: "val/loss",
          points: [
            { s: 100, v: 0.6 },
            { s: 200, v: 0.5 },
            { s: 300, v: 0.45 },
          ],
        },
      ],
    },
    {
      id: "training-b",
      experiment: "demo-models",
      dataset: "synthetic-v1",
      protocol: "evaluation-v1",
      series: [
        {
          name: "val/quality",
          points: [
            { s: 100, v: 0.72 },
            { s: 200, v: 0.79 },
          ],
        },
        {
          name: "val/loss",
          points: [
            { s: 100, v: 0.58 },
            { s: 200, v: 0.44 },
          ],
        },
      ],
    },
  ],
  ab: [
    {
      id: "ab-demo",
      control_group: "A",
      treatment_group: "B",
      slice: "all",
      period_start: "2026-01-01",
      period_end: "2026-01-14",
      status: "interim",
      multiplicity: "not_reported",
      metrics: [
        {
          metric: "engagement",
          direction: "max",
          role: "primary",
          control: 0.1,
          treatment: 0.102,
          ci_low: 0.5,
          ci_high: 3.5,
          ci_unit: "relative_percent",
          confidence: 0.95,
        },
        {
          metric: "negative_feedback",
          direction: "min",
          role: "guardrail",
          control: 0.02,
          treatment: 0.024,
          ci_low: 10,
          ci_high: 30,
          ci_unit: "relative_percent",
          confidence: 0.95,
        },
      ],
    },
  ],
};
