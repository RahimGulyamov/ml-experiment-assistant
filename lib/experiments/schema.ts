import { z } from "zod";

export const MAX_BYTES = 2 * 1024 * 1024;
export const identifier = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._-]+$/, "Только латиница, цифры, . _ -");
export const fieldName = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);
const number = z.number().finite().min(-1e15).max(1e15);
const scalar = z.union([z.string().max(160), number, z.boolean()]);
export const runSchema = z
  .object({
    id: identifier,
    name: z.string().trim().min(1).max(120),
    experiment: z.string().trim().min(1).max(100),
    dataset: z.string().trim().min(1).max(100),
    split: z.string().trim().min(1).max(80),
    status: z.enum(["finished", "failed", "running"]).default("finished"),
    duration_seconds: number.nonnegative().optional(),
    params: z
      .record(fieldName, scalar)
      .refine((v) => Object.keys(v).length <= 40, "Не более 40 параметров")
      .default({}),
    metrics: z
      .record(fieldName, number)
      .refine((v) => Object.keys(v).length <= 40, "Не более 40 метрик"),
    history: z
      .array(
        z
          .object({
            step: z.number().int().min(0).max(1e6),
            train_loss: number.nonnegative(),
            val_loss: number.nonnegative(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (let i = 1; i < r.history.length; i++)
      if (r.history[i].step <= r.history[i - 1].step)
        ctx.addIssue({
          code: "custom",
          path: ["history", i, "step"],
          message: "Шаги должны строго возрастать",
        });
  });
export type Run = z.infer<typeof runSchema>;
export const runsSchema = z
  .array(runSchema)
  .min(1, "Нужен хотя бы один запуск")
  .max(200, "Не более 200 запусков")
  .superRefine((runs, ctx) => {
    const ids = new Set<string>();
    runs.forEach((r, i) => {
      if (ids.has(r.id))
        ctx.addIssue({
          code: "custom",
          path: [i, "id"],
          message: `Повторяется ID: ${r.id}`,
        });
      ids.add(r.id);
    });
  });
export type Direction = "min" | "max";
export const groupKey = (r: Run) =>
  JSON.stringify([r.experiment, r.dataset, r.split]);
export function validationMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "Данные"}: ${i.message}`)
      .join("; ");
  return error instanceof Error ? error.message : "Не удалось прочитать данные";
}
