# Branch Notes

Durable state lives in `~/.openclaw`; the repo holds source, Docker wiring, skills, and sanitized operator docs.

## Shape

- Docker is the supported runtime. Gateway and CLI share the same image.
- Private work goes to `origin/my-changes`; official sync comes from `upstream`.
- Telegram is a restricted operator channel, not a public bot.
- Providers are explicit base URL plus API key entries; stale env names can break startup.
- SearXNG is the preferred local search backend; DuckDuckGo MCP and Google search are fallbacks.

## Code Pointers

- Reply entry: `src/auto-reply/reply/get-reply.ts`
- Session/reset/archive flow: `src/auto-reply/reply/session.ts`, `commands-reset.ts`, `commands-telegram-archives.ts`
- Command registry/localization: `src/auto-reply/commands-registry.shared.ts`, `commands-localization.ts`
- LaTeX image fallback: `src/auto-reply/reply/latex-reply-image.ts`
- Skill install metadata/runtime: `src/agents/skills-*`, `src/agents/skills/*`, `src/plugins/install-security-scan*`

## Rules

- Do not treat a successful build as healthy until logs and `/healthz` are checked.
- Prefer rebuild/restart for provider/runtime changes over pretending live model switching is always safe.
- Keep `/new` recoverable: archive rather than silently delete.
- Render math-heavy replies as images when text/Markdown would be fragile.
- Do not create alias-only `skills/<name>` directories; each directory appears as a separate Gateway skill.
- Keep hostnames, node IDs, IPs, and secrets out of committed docs.

## Common Pitfalls

- Generic request failures are usually provider, auth, or session-boundary problems.
- Browser UI failure can be frontend/runtime even if the backend is alive.
- Docker build cache can grow quickly; prune after large rebuilds.
- Public TLS is not enough; keep Gateway auth on behind nginx.

## Doc Roles

- `WORKLOG.md`: operational history and rebuilds.
- `CHANGELOG.md`: source behavior changes.
- `OPERATIONS.md`: commands.
- `OPENCLAW_ACCESS.md`: routes and exposure.
