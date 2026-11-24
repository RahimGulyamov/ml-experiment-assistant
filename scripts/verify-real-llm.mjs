import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const bundled =
  "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex";
const binary =
  process.env.RUN_NOTES_CODEX || (existsSync(bundled) ? bundled : "codex");
const directory = await mkdtemp(resolve(tmpdir(), "run-notes-llm-"));
const work = resolve(root, "work/real-llm");
await mkdir(work, { recursive: true });
const schema = {
  type: "object",
  properties: {
    comparison_step: { type: "integer" },
    quality_delta: { type: "number" },
    training_caveat: { type: "string" },
    ab_decision: { type: "string" },
    degraded_guardrails: { type: "array", items: { type: "string" } },
    explanation: { type: "string" },
  },
  required: [
    "comparison_step",
    "quality_delta",
    "training_caveat",
    "ab_decision",
    "degraded_guardrails",
    "explanation",
  ],
  additionalProperties: false,
};
await writeFile(resolve(directory, "schema.json"), JSON.stringify(schema));
const config = {
  command: process.execPath,
  args: [
    "--import",
    resolve(root, "node_modules/tsx/dist/loader.mjs"),
    resolve(root, "scripts/mcp-stdio.ts"),
  ],
};
const args = [
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--sandbox",
  "read-only",
  "--skip-git-repo-check",
  "--json",
  "--cd",
  directory,
  "-c",
  `mcp_servers.run_notes.command=${JSON.stringify(config.command)}`,
  "-c",
  `mcp_servers.run_notes.args=${JSON.stringify(config.args)}`,
  "--output-schema",
  resolve(directory, "schema.json"),
  "--output-last-message",
  resolve(directory, "answer.json"),
  "-",
];
const prompt =
  "This is a bounded verification of the Run Notes application on synthetic fixtures only. Do not read files, use shell, network, other tools or modify anything. Use ONLY run_notes MCP. First discover sources. Compare training-a and training-b using val/quality and val/loss on one complete common step; report treatment minus baseline quality difference and explain why the other run's last step cannot be mixed in. Analyze ab-demo: determine whether improved engagement is enough given guardrails and supplied confidence intervals. Use the actual compare_training_exports and analyze_ab_result tools, not mental guesses. Return the requested JSON, with explanation in Russian. This is not a rollout instruction.";
const child = spawn(binary, args, {
  cwd: directory,
  stdio: ["pipe", "pipe", "pipe"],
});
let output = "",
  errors = "";
child.stdout.on("data", (d) => (output += d));
child.stderr.on("data", (d) => (errors += d));
child.stdin.end(prompt);
const timer = setTimeout(() => child.kill("SIGTERM"), 150000);
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
clearTimeout(timer);
await writeFile(resolve(work, "events.jsonl"), output);
await writeFile(resolve(work, "process.log"), errors);
if (code !== 0)
  throw new Error(
    `Real LLM verification did not finish (exit ${code}). Local logs in work/real-llm; no credentials are printed.`,
  );
const answer = JSON.parse(
  await readFile(resolve(directory, "answer.json"), "utf8"),
);
const events = output
  .split("\n")
  .filter(Boolean)
  .map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const calls = events
  .filter(
    (e) => e.item?.type === "mcp_tool_call" && e.item.status === "completed",
  )
  .map((e) => ({
    tool: e.item.tool,
    server: e.item.server,
    status: e.item.status,
  }));
const failedCalls = events.filter(
  (e) =>
    e.item?.type === "mcp_tool_call" &&
    e.item.status === "completed" &&
    (e.item.error || e.item.result?.isError),
);
if (failedCalls.length)
  throw new Error("MCP returned an error during the real model verification");
if (calls.some((c) => c.server !== "run_notes"))
  throw new Error("Unexpected MCP server used during verification");
const tools = new Set(calls.map((c) => c.tool));
if (!tools.has("compare_training_exports") || !tools.has("analyze_ab_result"))
  throw new Error(
    "No verified MCP tool events for required analyses; inspect local logs.",
  );
if (events.some((e) => e.item?.type === "command_execution"))
  throw new Error(
    "Unexpected shell use during verification; review before accepting.",
  );
if (
  answer.comparison_step !== 200 ||
  Math.abs(answer.quality_delta - 0.04) > 1e-8 ||
  answer.ab_decision !== "guardrail_violation" ||
  !answer.degraded_guardrails.includes("negative_feedback")
)
  throw new Error(
    "Real model result failed acceptance checks; inspect local answer.",
  );
const verification = {
  tested_at: new Date().toISOString(),
  route:
    "Local Codex CLI with existing ChatGPT authentication and real stdio MCP",
  fixtures: "synthetic public demo only",
  launcher_ui_verified: false,
  web_llm_api_verified: false,
  passed: true,
  calls,
  answer,
};
await writeFile(
  resolve(work, "verification.json"),
  JSON.stringify(verification, null, 2) + "\n",
);
console.log(
  "PASS: real LLM called training and A/B MCP tools and returned verified facts.",
);
console.log(
  JSON.stringify(
    {
      comparison_step: answer.comparison_step,
      quality_delta: answer.quality_delta,
      ab_decision: answer.ab_decision,
      calls,
    },
    null,
    2,
  ),
);
