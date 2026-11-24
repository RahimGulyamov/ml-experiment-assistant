import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "../lib/mcp/server";
import { withExperimentClient } from "../lib/mcp/client";
import { DEMO_RUNS } from "../lib/experiments/demo";

describe("actual MCP HTTP transport", () => {
  it("initializes, discovers tools, calls and records exact results", async () => {
    const methods: string[] = [];
    const client = new Client({ name: "integration-test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
        fetch: async (input, init) => {
          const req = new Request(input, init);
          if (req.method === "POST")
            methods.push(
              ((await req.clone().json()) as { method: string }).method,
            );
          return handleMcp(req, DEMO_RUNS);
        },
      }),
    );
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual([
        "list_runs",
        "compare_runs",
        "inspect_run",
        "diagnose_run",
      ]);
      const r = await client.callTool({
        name: "compare_runs",
        arguments: {
          run_ids: ["run-001", "run-005"],
          metric: "accuracy",
          direction: "max",
        },
      });
      expect(
        JSON.parse((r.content as { text: string }[])[0].text).winner_id,
      ).toBe("run-005");
      expect(methods).toEqual(
        expect.arrayContaining([
          "initialize",
          "notifications/initialized",
          "tools/list",
          "tools/call",
        ]),
      );
    } finally {
      await client.close();
    }
  });
  it("isolates concurrent user datasets", async () => {
    const results = await Promise.all(
      ["private-a", "private-b"].map((id) =>
        withExperimentClient(
          [{ ...DEMO_RUNS[0], id }],
          async (_c, trace, call) => {
            await call("list_runs", {});
            return trace[0].result;
          },
        ),
      ),
    );
    expect((results[0] as { id: string }[])[0].id).toBe("private-a");
    expect((results[1] as { id: string }[])[0].id).toBe("private-b");
  });
  it("validates tool schema and rejects cross-group comparisons", async () => {
    await withExperimentClient(
      [{ ...DEMO_RUNS[0] }, { ...DEMO_RUNS[1], split: "test" }],
      async (_c, trace, call) => {
        await call("compare_runs", {
          run_ids: ["run-001", "run-002"],
          metric: "accuracy",
          direction: "max",
        });
        expect(trace[0].isError).toBe(true);
        expect(String(trace[0].result)).toContain("experiment/dataset/split");
        await call("inspect_run", { run_id: "unknown" });
        expect(trace[1].isError).toBe(true);
      },
    );
  });
});
