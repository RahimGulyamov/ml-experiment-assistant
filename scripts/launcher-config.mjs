import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const i = args.indexOf("--workspace");
if (i !== -1 && !args[i + 1])
  throw new Error("--workspace requires an approved JSON path");
const nodeArgs = [
  "--import",
  resolve(root, "node_modules/tsx/dist/loader.mjs"),
  resolve(root, "scripts/mcp-stdio.ts"),
  ...(i === -1 ? [] : ["--workspace", resolve(args[i + 1])]),
];
if (args.includes("--codex")) {
  console.log(
    "[mcp_servers.run_notes]\ncommand = " +
      JSON.stringify(process.execPath) +
      "\nargs = " +
      JSON.stringify(nodeArgs) +
      "\n",
  );
} else
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          run_notes: { command: process.execPath, args: nodeArgs },
        },
      },
      null,
      2,
    ),
  );
