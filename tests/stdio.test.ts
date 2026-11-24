import { it, expect } from "vitest";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
it("serves real stdio MCP for a launcher client with training and A/B tools", async () => {
  const c = new Client({ name: "launcher-integration-test", version: "1" });
  try {
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--import",
          resolve("node_modules/tsx/dist/loader.mjs"),
          resolve("scripts/mcp-stdio.ts"),
        ],
        stderr: "pipe",
      }),
    );
    const listed = await c.listTools();
    expect(listed.tools.map((t) => t.name)).toContain(
      "compare_training_exports",
    );
    const result = await c.callTool({
      name: "compare_training_exports",
      arguments: {
        export_ids: ["training-a", "training-b"],
        metrics: ["val/quality", "val/loss"],
      },
    });
    expect(
      JSON.parse((result.content as { text: string }[])[0].text)
        .comparison_step,
    ).toBe(200);
    const ab = await c.callTool({
      name: "analyze_ab_result",
      arguments: { report_id: "ab-demo" },
    });
    expect(
      JSON.parse((ab.content as { text: string }[])[0].text).decision,
    ).toBe("guardrail_violation");
  } finally {
    await c.close();
  }
});

it("uses only explicitly configured workspace data without mixing demo runs", async () => {
  const c = new Client({ name: "configured-workspace-test", version: "1" });
  try {
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--import",
          resolve("node_modules/tsx/dist/loader.mjs"),
          resolve("scripts/mcp-stdio.ts"),
          "--workspace",
          resolve("public/examples/developer-workspace.json"),
        ],
        stderr: "pipe",
      }),
    );
    const runs = await c.callTool({ name: "list_runs", arguments: {} });
    expect(JSON.parse((runs.content as { text: string }[])[0].text)).toEqual(
      [],
    );
    const sources = await c.callTool({
      name: "list_workspace_sources",
      arguments: {},
    });
    expect(
      JSON.parse((sources.content as { text: string }[])[0].text).training.map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual(["training-a", "training-b"]);
  } finally {
    await c.close();
  }
});
