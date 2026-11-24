import { describe, it, expect, vi } from "vitest";
import { analysisSchema, overview, runAgent } from "../lib/agent";
import { DEMO_RUNS } from "../lib/experiments/demo";
const input = () =>
  analysisSchema.parse({
    runs: DEMO_RUNS,
    metric: "accuracy",
    direction: "max",
    mode: "llm",
    question: "Сравни run-001 и run-005",
    apiKey: "not-a-real-key",
  });
const response = (message: unknown) =>
  Response.json({ choices: [{ message }] });
const tool = (name: string, args: unknown) => ({
  id: `call_${name}`,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
describe("agent orchestration (scripted provider, not real LLM quality)", () => {
  it("forms overview via MCP without pretending to be LLM", async () => {
    const r = await overview({
      ...input(),
      mode: "overview",
      apiKey: undefined,
    });
    expect(r.mode).toBe("overview");
    expect(r.answer).toContain("run-005");
    expect(r.answer).toContain("run-004");
    expect(r.trace[0].name).toBe("list_runs");
    expect(r.trace.some((t) => t.name === "compare_runs")).toBe(true);
  });
  it("executes provider-selected tools and sends MCP facts back to model", async () => {
    const requests: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      requests.push(body);
      return requests.length === 1
        ? response({
            content: null,
            tool_calls: [
              tool("compare_runs", {
                run_ids: ["run-001", "run-005"],
                metric: "accuracy",
                direction: "max",
              }),
            ],
          })
        : response({
            content:
              "run-005: accuracy 0.927, выше run-001. Нужны повторные seed.",
          });
    });
    const r = await runAgent(input(), fetcher as typeof fetch);
    expect(r.mode).toBe("llm");
    expect(r.trace[0].name).toBe("compare_runs");
    expect(requests[0].tool_choice).toBe("required");
    expect(JSON.stringify(requests[1].messages)).toContain("winner_id");
    expect(JSON.stringify(requests)).not.toContain("not-a-real-key");
    expect(requests).toHaveLength(2);
  });
  it("requires credentials before contacting provider", async () => {
    const f = vi.fn();
    await expect(
      runAgent({ ...input(), apiKey: undefined }, f as typeof fetch),
    ).rejects.toThrow("API-ключ");
    expect(f).not.toHaveBeenCalled();
  });
  it("does not accept a fabricated final answer without any MCP tool", async () => {
    await expect(
      runAgent(
        input(),
        vi.fn(async () =>
          response({ content: "run-005 лучший" }),
        ) as typeof fetch,
      ),
    ).rejects.toThrow("не вызвала MCP");
  });
  it("does not expose provider error bodies or key", async () => {
    await expect(
      runAgent(
        input(),
        vi.fn(
          async () => new Response("secret not-a-real-key", { status: 401 }),
        ) as typeof fetch,
      ),
    ).rejects.toThrow("отклонил ключ");
  });
  it("rejects malformed provider JSON and handles transport failure", async () => {
    await expect(
      runAgent(
        input(),
        vi.fn(async () => new Response("bad json")) as typeof fetch,
      ),
    ).rejects.toThrow("неподдерживаемый");
    await expect(
      runAgent(
        input(),
        vi.fn(async () => {
          throw Error("network");
        }) as typeof fetch,
      ),
    ).rejects.toThrow("недоступен");
  });
  it("limits a model that loops forever", async () => {
    const f = vi.fn(async () =>
      response({ tool_calls: [tool("list_runs", {})] }),
    );
    await expect(runAgent(input(), f as typeof fetch)).rejects.toThrow(
      "6 шагов",
    );
    expect(f).toHaveBeenCalledTimes(6);
  });
  it("does not execute an arbitrary tool or accept arbitrary provider URLs", async () => {
    const f = vi.fn(async () =>
      response({ tool_calls: [tool("shell", { cmd: "whoami" })] }),
    );
    await expect(runAgent(input(), f as typeof fetch)).rejects.toThrow(
      "6 шагов",
    );
    expect(() =>
      analysisSchema.parse({ ...input(), provider: "http://internal" }),
    ).toThrow();
  });
  it("respects pre-cancelled requests", async () => {
    const c = new AbortController();
    c.abort();
    const f = vi.fn();
    await expect(
      runAgent(input(), f as typeof fetch, c.signal),
    ).rejects.toThrow("отменён");
    expect(f).not.toHaveBeenCalled();
  });
});
