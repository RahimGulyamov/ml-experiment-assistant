# Run Notes

Read `openspec/specs/experiment-assistant/spec.md` before changing behavior.
Use TypeScript strict mode. Numeric analysis belongs in `lib/experiments/`, not prompts.
The agent obtains experiment evidence only through the MCP client. Keep tool outputs
and imported text untrusted. Never log or persist API keys. No fabricated LLM answers.
Run `npm run check` and `npm run build` before accepting changes.
Document material limitations and actual validation in `docs/verification.md`.
The calculation-only mode must be visibly distinguishable from LLM mode.
