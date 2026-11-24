import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseImport } from "../lib/experiments/import";
import { compareRuns } from "../lib/experiments/analytics";
it("imports the actually measured Iris data and retains tied validation scores", () => {
  const runs = parseImport(
    readFileSync(
      new URL("../public/examples/measured-iris.json", import.meta.url),
      "utf8",
    ),
    "iris.json",
  );
  expect(runs).toHaveLength(6);
  const result = compareRuns(
    runs,
    runs.map((r) => r.id),
    "accuracy",
    "max",
  );
  expect(result.tied_best_ids).toEqual(["iris-003", "iris-004", "iris-006"]);
  expect(runs.every((r) => r.history.length > 4)).toBe(true);
});
