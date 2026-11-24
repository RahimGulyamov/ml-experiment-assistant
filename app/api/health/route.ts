export function GET() {
  return Response.json(
    {
      status: "ok",
      app: "run-notes",
      version: "1.0.0",
      mcp: "streamable-http",
      llm: "bring-your-own-key",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
