import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const url = new URL(process.argv[2] || "http://localhost:5173/mcp");
const client = new Client({ name: "run-notes-smoke", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  console.log("MCP tools:", tools.tools.map((t) => t.name).join(", "));
  const result = await client.callTool({
    name: "compare_runs",
    arguments: {
      run_ids: ["run-001", "run-005"],
      metric: "accuracy",
      direction: "max",
    },
  });
  const c = JSON.parse((result.content as { text: string }[])[0].text);
  if (c.winner_id !== "run-005")
    throw new Error("Unexpected comparison result");
  console.log(
    "PASS: initialize → tools/list → tools/call; winner",
    c.winner_id,
  );
} finally {
  await client.close();
}
