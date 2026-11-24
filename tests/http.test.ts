import { describe, it, expect } from "vitest";
import { POST } from "../app/api/analyze/route";
import { readBoundedJson } from "../lib/http";
import { DEMO_RUNS } from "../lib/experiments/demo";
import type { AnalysisResult } from "../lib/agent";
describe("HTTP validation", () => {
  it("serves a complete calculation scenario", async () => {
    const r = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runs: DEMO_RUNS,
          metric: "accuracy",
          direction: "max",
          mode: "overview",
        }),
      }),
    );
    expect(r.status).toBe(200);
    const d = (await r.json()) as AnalysisResult;
    expect(d.answer).toContain("run-005");
    expect(d.trace).toHaveLength(9);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects foreign Origin before analyzing anything", async () => {
    const r = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
    );
    expect(r.status).toBe(403);
  });
  it("rejects malformed requests without stack traces", async () => {
    const r = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(r.status).toBe(400);
    expect(await r.text()).not.toContain("stack");
  });
  it("enforces body size even without Content-Length", async () => {
    const req = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '"' + "a".repeat(2 * 1024 * 1024) + '"',
    });
    await expect(readBoundedJson(req)).rejects.toThrow("2 MiB");
  });
});
