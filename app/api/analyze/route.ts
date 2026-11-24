import { analysisSchema, AnalysisError, overview, runAgent } from "@/lib/agent";
import { validationMessage } from "@/lib/experiments/schema";
import { apiHeaders, readBoundedJson, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Недопустимый Origin" },
      { status: 403, headers: apiHeaders },
    );
  try {
    const input = analysisSchema.parse(await readBoundedJson(request));
    return Response.json(
      await (input.mode === "overview"
        ? overview(input)
        : runAgent(input, fetch, request.signal)),
      { headers: apiHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AnalysisError
            ? error.message
            : validationMessage(error),
      },
      {
        status: error instanceof AnalysisError ? error.status : 400,
        headers: apiHeaders,
      },
    );
  }
}
