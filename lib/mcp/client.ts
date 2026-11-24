import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcp } from "./server";
import type { Run } from "../experiments/schema";

export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
  duration_ms: number;
}

export async function withExperimentClient<T>(
  runs: Run[],
  callback: (
    client: Client,
    trace: ToolTrace[],
    call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  ) => Promise<T>,
): Promise<T> {
  const client = new Client(
    { name: "run-notes-agent", version: "1.0.0" },
    { capabilities: {} },
  );
  // Real Streamable HTTP + JSON-RPC through SDK. Requests are dispatched locally
  // to avoid a public self-fetch and to bind immutable data to this request only.
  // The identical handler is exposed as /mcp with the public demo data.
  const transport = new StreamableHTTPClientTransport(
    new URL("https://request-local.invalid/mcp"),
    {
      fetch: async (input, init) => handleMcp(new Request(input, init), runs),
    },
  );
  const trace: ToolTrace[] = [];
  try {
    await client.connect(transport);
    const call = async (name: string, args: Record<string, unknown>) => {
      const start = Date.now();
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { type: string; text?: string }[];
      const raw = content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      trace.push({
        name,
        arguments: args,
        result: data,
        isError: !!result.isError,
        duration_ms: Date.now() - start,
      });
      return { data, isError: !!result.isError };
    };
    return await callback(client, trace, call);
  } finally {
    await client.close();
  }
}
