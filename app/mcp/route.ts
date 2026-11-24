import { handleMcp } from "@/lib/mcp/server";
import { DEMO_RUNS } from "@/lib/experiments/demo";
import { apiHeaders, readBoundedJson, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Недопустимый Origin" }, { status: 403 });
  try {
    const data = await readBoundedJson(request);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const response = await handleMcp(
      new Request(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      }),
      DEMO_RUNS,
    );
    for (const [k, v] of Object.entries(apiHeaders)) response.headers.set(k, v);
    return response;
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid request" },
      },
      { status: 400, headers: apiHeaders },
    );
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
