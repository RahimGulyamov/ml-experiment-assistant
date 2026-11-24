import type { Run } from "./schema";

// Synthetic, deterministic teaching data. Not measured benchmark results.
const rows = [
  [
    "run-001",
    "Baseline · ResNet-18",
    0.873,
    0.431,
    420,
    0.001,
    0,
    32,
    "finished",
  ],
  [
    "run-002",
    "Меньше learning rate",
    0.891,
    0.364,
    438,
    0.0003,
    0,
    32,
    "finished",
  ],
  ["run-003", "Weight decay", 0.918, 0.286, 452, 0.0003, 0.01, 32, "finished"],
  ["run-004", "Длинное обучение", 0.902, 0.412, 910, 0.0003, 0, 32, "finished"],
  ["run-005", "Аугментации", 0.927, 0.258, 580, 0.0003, 0.01, 32, "finished"],
  [
    "run-006",
    "Большой batch",
    0.912,
    0.301,
    310,
    0.0003,
    0.01,
    128,
    "finished",
  ],
  ["run-007", "Высокий learning rate", 0.612, 0.941, 92, 0.1, 0, 32, "failed"],
  [
    "run-008",
    "Контрольный seed",
    0.924,
    0.263,
    576,
    0.0003,
    0.01,
    32,
    "finished",
  ],
] as const;

export const DEMO_RUNS: Run[] = rows.map((r, index) => ({
  id: r[0],
  name: r[1],
  experiment: "cifar10-resnet18",
  dataset: "CIFAR-10",
  split: "validation-v1",
  status: r[8],
  duration_seconds: r[4],
  params: {
    architecture: "resnet18",
    learning_rate: r[5],
    weight_decay: r[6],
    batch_size: r[7],
    seed: index === 7 ? 43 : 42,
    augmentation: index === 4 || index === 7 ? "random_crop+flip" : "none",
    epochs: index === 3 ? 60 : 20,
  },
  metrics: {
    accuracy: r[2],
    val_loss: r[3],
    f1_macro: Number((r[2] - 0.006).toFixed(3)),
  },
  history:
    r[8] === "failed"
      ? []
      : Array.from({ length: 12 }, (_, i) => ({
          step: (i + 1) * (index === 3 ? 5 : 2),
          train_loss: Number((1.08 * Math.exp(-i * 0.31) + 0.04).toFixed(3)),
          val_loss: Number(
            (index === 3
              ? 0.76 * Math.exp(-i * 0.5) + 0.19 + Math.max(0, i - 4) * 0.031
              : 0.8 * Math.exp(-i * 0.45) + r[3] - 0.006
            ).toFixed(3),
          ),
        })),
}));

export const DEMO_LABEL = "Учебный набор · синтетические данные";
