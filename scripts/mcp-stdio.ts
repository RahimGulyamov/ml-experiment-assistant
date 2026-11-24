import { readFile, stat } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createExperimentServer } from "../lib/mcp/server";
import { workspaceSchema } from "../lib/workspace/data";
import { DEMO_WORKSPACE } from "../lib/workspace/demo";
import { DEMO_RUNS } from "../lib/experiments/demo";

const args = process.argv.slice(2);
let workspace = DEMO_WORKSPACE;
try {
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--workspace")
      throw new Error(
        "Usage: mcp-stdio.ts [--workspace /absolute/approved-workspace.json]",
      );
    const info = await stat(args[1]);
    if (info.size > 2 * 1024 * 1024)
      throw new Error("Workspace is larger than 2 MiB");
    workspace = workspaceSchema.parse(
      JSON.parse(await readFile(args[1], "utf8")),
    );
  }
  const server = createExperimentServer(
    args.length ? [] : DEMO_RUNS,
    workspace,
  );
  await server.connect(new StdioServerTransport());
  // MCP stdout is protocol-only. Never write logs, credentials or file contents.
} catch {
  console.error(
    "Run Notes MCP: invalid workspace or configuration. Use an approved version=1 JSON workspace (up to 2 MiB).",
  );
  process.exitCode = 1;
}
