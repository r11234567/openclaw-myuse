# My Change Log

This branch covered four layers of work:

1. runtime behavior
2. provider and gateway wiring
3. deployment and access hygiene
4. repo / secret hygiene

## Requests to changes

| Request | Files changed | Why |
| --- | --- | --- |
| Run OpenClaw in Docker on a VPS and keep CLI available | `Dockerfile`, `docker-compose.yml`, `OPERATIONS.md` | Make the runtime reproducible, keep CLI access in the image, and make rebuild / restart commands explicit. |
| Support multiple non-standard providers with custom base URLs + keys | `src/config/config.ts`, `src/config/io.ts`, local `.env`, local `~/.openclaw/openclaw.json` | Normalize provider definitions so OpenAI-compatible and Anthropic-compatible sources can be mixed safely. |
| Make the default model usable with the current provider set | `src/config/config.ts`, `src/config/io.ts` | Avoid startup-time secret misses and stop the gateway from resolving a provider that is no longer configured. |
| Add Telegram allowlist behavior and Chinese-facing command labels / replies | `extensions/telegram/src/command-ui.ts`, `src/auto-reply/commands-localization.ts`, `src/auto-reply/commands-registry.shared.ts`, `src/auto-reply/reply/commands-handlers.runtime.ts`, `src/auto-reply/reply/commands-info.ts` | Keep the bot usable for one approved user while making the visible command surface easier to use in Telegram. |
| Make `/new` and archive handling preserve conversations instead of dropping them | `src/auto-reply/reply/commands-telegram-archives.ts`, `src/auto-reply/reply/commands-reset.ts`, `src/auto-reply/reply/session.ts`, related tests | Preserve history, separate archive from delete, and stop TG session resets from destroying usable context. |
| Render LaTeX as images when raw math becomes hard to read | `src/auto-reply/reply/latex-reply-image.ts`, `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/reply/reply-media-paths.ts` | Telegram and the gateway UI are more reliable with rendered images when markdown or LaTeX parsing is fragile. |
| Document public and tailnet access paths | `OPENCLAW_ACCESS.md`, `OPERATIONS.md` | Turn ad hoc access notes into a repeatable access runbook with safe defaults and sanitized placeholders. |
| Prevent secrets, certs, and runtime state from being committed | `.gitignore` | Keep `.env`, state directories, cert material, and other local-only artifacts out of GitHub. |
| Move the working copy to a private origin and keep upstream official | git remotes, branch config | Preserve a private branch for local changes while still allowing clean rebases from upstream. |

## Why these changes were needed

- The gateway has to resolve provider secrets at startup. If a provider name or env key is stale, startup fails before the UI is usable.
- Telegram and the gateway share session state, so archive and model-switch behavior needs to be explicit instead of implicit.
- Raw LaTeX, tables, and long command menus are fragile in Telegram; image fallback and localized commands reduce breakage.
- Public access needs a clear path: loopback for safety, tailnet for private remote use, and nginx plus TLS only when public exposure is intentional.
- Local state is noisy and sensitive. Once `.env`, certs, or runtime state enter Git history, the repo stops being safe to share.

## Current branch outcome

- Private `origin` points to the private GitHub repo.
- `upstream` still points to the official OpenClaw repo.
- The working tree now has a sanitized deployment/access doc set under `docs/mychange/`.
- Docker build cache was pruned after the rebuild.
- The current default agent model is `aitoken/claude-opus-4-6`.

