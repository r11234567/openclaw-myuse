# Source Change Log

Source behavior only. Rebuilds, deployment, nginx, certificates, and live operations belong in `WORKLOG.md`.

## Session And Telegram

- `/new` and `/reset` are routed through the session state machine instead of plain text handling.
- `/new` preserves recoverability by archiving the current Telegram conversation.
- Empty command-only turns are guarded so they do not create useless archives.
- Telegram archive commands support list, switch, current-chat filtering, and delete.
- Archive codes are short, stable 5-character identifiers.
- Telegram archive codes are written back into the transcript so a `/use` -> `/new` round-trip keeps the same code.
- Telegram command menu and user-facing command copy were localized toward Chinese while keeping compatibility aliases internal.

## Reply Rendering

- LaTeX-heavy replies can be rendered as a PNG when raw text or Markdown is unreliable.
- The renderer probes for CJK-capable fonts and logs a concrete hint when `fontconfig` or CJK fonts are missing.
- Mixed text/formula layout still needs careful visual review after image/runtime changes.

## Providers And Startup

- Non-standard providers are configured as explicit OpenAI-compatible or Anthropic-compatible entries.
- Provider model sets are explicit; stale env names and missing provider secrets should fail visibly.
- The default model tracks the working runtime provider rather than stale defaults.

## Skills And Installers

- Skill install metadata now accepts `apt` installers in addition to brew/node/go/uv/download.
- `skills/github/SKILL.md` advertises Linux apt installation for `gh`.
- Runtime skill dependencies are installed through Dockerfile/build configuration, not ad hoc container installs.
- `network-search` prefers SearXNG, then DuckDuckGo MCP, then Google Custom Search, with Apify reserved as a last-resort extraction fallback.

## Decisions To Preserve

- Telegram archives are chat-local.
- Compatibility aliases may exist, but they should not define the visible UX.
- Live model switching can fail on session locks or auth state; surface that instead of masking it.
- Alias-only skills should not become extra Gateway-visible directories.
