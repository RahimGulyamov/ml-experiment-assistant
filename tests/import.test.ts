import { describe, it, expect } from "vitest";
import { parseImport } from "../lib/experiments/import";
import { DEMO_RUNS } from "../lib/experiments/demo";
const header =
  "id,name,experiment,dataset,split,metric.accuracy,param.seed,duration_seconds";
describe("data import", () => {
  it("parses JSON and retains history", () =>
    expect(
      parseImport(JSON.stringify(DEMO_RUNS), "data.JSON")[0].history,
    ).toHaveLength(12));
  it("parses quoted CSV and decimal metrics", () => {
    const r = parseImport(
      `${header}\na,"name, quoted",exp,data,val,0.85,42,10`,
      "a.csv",
    )[0];
    expect(r.name).toBe("name, quoted");
    expect(r.metrics.accuracy).toBe(0.85);
    expect(r.params.seed).toBe("42");
    expect(r.duration_seconds).toBe(10);
  });
  it("does not coerce absent metrics to zero", () => {
    const r = parseImport(`${header}\na,test,exp,data,val,,42,10`, "a.csv")[0];
    expect(r.metrics).toEqual({});
  });
  it("rejects invalid numbers and missing headers", () => {
    expect(() =>
      parseImport(`${header}\na,test,exp,data,val,NaN,42,10`, "a.csv"),
    ).toThrow("числом");
    expect(() => parseImport("id,name\na,test", "a.csv")).toThrow("колонки");
  });
  it("rejects duplicate CSV headers rather than silently renaming", () =>
    expect(() =>
      parseImport(
        "id,name,experiment,dataset,split,metric.x,metric.x\na,n,e,d,v,1,2",
        "a.csv",
      ),
    ).toThrow("повторяющиеся"));
  it("rejects unknown columns, invalid JSON, oversized input and unsupported formats", () => {
    expect(() =>
      parseImport(`${header},unknown\na,n,e,d,v,1,s,1,x`, "a.csv"),
    ).toThrow("неизвестная");
    expect(() => parseImport("{bad}", "a.json")).toThrow("JSON");
    expect(() =>
      parseImport(" ".repeat(2 * 1024 * 1024 + 1), "a.json"),
    ).toThrow("2 MiB");
    expect(() => parseImport("[]", "a.exe")).toThrow(".json");
  });
});
