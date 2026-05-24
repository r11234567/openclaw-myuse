# OpenClaw (private deployment)

This repository is the private working fork for a single-operator OpenClaw deployment.
It keeps the Gateway and CLI in one Docker runtime, uses Telegram as a controlled entry point, and leaves room for later frontend, agent, and MCP expansion.

## What this fork currently does

- Runs OpenClaw in Docker.
- Keeps the CLI available in the same runtime as the Gateway.
- Runtime image keeps `pnpm` available via Corepack for container-local commands.
- Supports multiple upstream providers with explicit base URL plus API key settings.
- Uses Telegram as a locked-down operator channel.
- Preserves conversation history with archive, switch, and delete flows.
- Renders math-heavy replies as images when raw text would be hard to read.
- Provides a local SearXNG search service for self-hosted network search.
- Exposes the Gateway locally first, then through nginx and public TLS when needed.

## Deployment shape

1. Clone the private repo and keep `upstream` pointed at the official OpenClaw repository.
2. Fill `.env` and the local OpenClaw config with provider endpoints, API keys, Telegram token, Telegram allowlist, and any DNS API credentials needed for ACME.
3. Build and start the Docker stack, including SearXNG when network search is needed.
4. Check the Gateway logs and health output before trusting the UI.
5. Expose the Gateway through nginx only after authentication and proxy headers are correct.
6. Keep the CLI available for day-to-day operator commands such as `doctor`, `models`, `devices`, `pairing`, and session inspection.

## Where to look

- `docs/mychange/WORKLOG.md`: high-frequency operational log. Check this first when something breaks.
- `docs/mychange/AGENTS.md`: background, architecture, preferences, and half-finished work.
- `docs/mychange/OPERATIONS.md`: build, run, health-check, and cleanup commands.
- `docs/mychange/CHANGELOG.md`: source-code changes only, with the reasons they happened.
- `docs/mychange/OPENCLAW_ACCESS.md`: current access topology and entry paths.

## For AI assistants

- Read the docs in the same order as "Where to look" above.
- End every task by updating the right file: source changes go to `CHANGELOG.md`, operational actions go to `WORKLOG.md`, and new pitfalls or durable context go to `AGENTS.md`.
- Do not amend commits during normal work.
- Push to the private `origin` by default; keep `upstream` for official syncing only.

## Implemented behavior

- Provider wiring for OpenAI-compatible and Anthropic-compatible upstreams.
- Telegram command handling that can stay local to a single operator account.
- Session archive handling that favors recoverability over hard deletion.
- Short archive codes for switching and deletion.
- LaTeX fallback rendering for replies that would otherwise be hard to read.
- Public deployment notes for nginx plus ACME DNS validation.

## How to update this README

- When the deployment shape changes, update the relevant bullet in "Deployment shape" and the matching runbook under `docs/mychange/`.
- When source behavior changes, link the change to the matching phase in `docs/mychange/CHANGELOG.md`.
- When access paths change, update `docs/mychange/OPENCLAW_ACCESS.md` first, then reflect the new default here.
- Keep this file practical: describe what is deployed, how it is reached, and what is actually usable now.
