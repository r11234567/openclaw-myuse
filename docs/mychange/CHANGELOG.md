# My Change Log

## Timeline

### Phase 1: bootstrap the deployment

- Started from the Hetzner install flow and the local Docker compose stack.
- Brought up OpenClaw in Docker so the gateway and CLI share one runtime image.
- Kept the CLI around because later work depended on `models`, `doctor`, `pairing`, and direct gateway diagnostics.
- Confirmed the gateway could run in Docker without asking for a second install of `acme.sh`.

### Phase 2: provider cleanup

- Replaced the early generic provider wiring with explicit custom providers.
- Mapped non-standard providers into OpenClaw provider IDs instead of trying to force them through one generic `CUSTOM_*` slot.
- Split OpenAI-compatible and Anthropic-compatible endpoints into separate provider entries.
- Removed the stale `zzshu` provider path once it became clear the runtime was still resolving `CUSTOM_ZZSHU_API_KEY`.
- Set the default model to `aitoken/claude-opus-4-6` so startup could succeed with the current real keys.
- Learned that provider config was not just documentation; it directly controlled gateway startup success.
- Learned that a "works in config" provider is still broken if the runtime env key name is stale.

### Phase 3: Telegram and session behavior

- Restricted Telegram to one allowlisted user.
- Added Chinese-facing command text and command-menu labeling where the surface was stable enough to localize.
- Added archive browsing, archive switching, archive deletion, and `/new` behavior that archives instead of discarding the chat.
- Kept dashboard-created sessions out of the Telegram archive flow.
- Added short archive codes so session selection does not depend on rotating numeric labels.
- Kept `/tg_*` aliases as compatibility, not as the preferred human-facing command surface.
- Chose archive over delete for `/new` because the user wanted recoverability, not a hard reset.

### Phase 4: reply rendering and UX cleanup

- Added LaTeX-to-image rendering so math-heavy answers do not depend on fragile Telegram markdown or browser-side math parsing.
- Made the rendered image path the fallback for replies that become unreadable as plain text.
- Preserved normal text replies when no LaTeX is present.
- Decided against trying to make every LaTeX fragment survive Telegram markdown unchanged.

### Phase 5: access and deployment hygiene

- Wrote access notes for loopback, tailnet, nginx, and public TLS exposure.
- Added explicit `acme.sh` / Cloudflare DNS validation flow.
- Trimmed Docker build cache after the rebuild because disk pressure had become a real issue.
- Sanitized local paths, Tailscale names, node IDs, and hostnames out of the operator docs before shipping them.
- Confirmed that the docs should describe the deployment shape, but not the real host fingerprint.

### Phase 6: repo hygiene

- Added `.gitignore` rules for `.env`, `openclaw.json`, `.openclaw/`, `.acme.sh/`, cert files, and other local-only state.
- Moved the working branch to a private `origin` while keeping the official repo as `upstream`.
- Pushed the sanitized doc set to the private repo.
- Accepted that once the branch was amended, the commit chain became a compact branch history rather than a step-by-step replay.

## Requests to changes

| Request | Files changed | Why |
| --- | --- | --- |
| Docker VPS runtime with CLI preserved | `Dockerfile`, `docker-compose.yml` | Keep one runnable image for gateway + CLI. |
| Multiple non-standard providers | `src/config/config.ts`, `src/config/io.ts`, `.env`, `~/.openclaw/openclaw.json` | Support different OpenAI-compatible and Anthropic-compatible upstreams with base URL + key pairs. |
| Provider defaults that actually start | `src/config/config.ts`, `src/config/io.ts` | Avoid a provider reference that still points at missing secrets. |
| Telegram-only allowlist | config + Telegram channel wiring | Keep the bot limited to the approved operator. |
| Chinese command surface | `extensions/telegram/src/command-ui.ts`, `src/auto-reply/commands-localization.ts`, `src/auto-reply/commands-registry.shared.ts` | Make the slash-command menu and visible responses usable in Telegram. |
| `/new` should archive, not discard | `src/auto-reply/reply/session.ts`, `src/auto-reply/reply/commands-reset.ts`, `src/auto-reply/reply/commands-telegram-archives.ts` | Preserve chats and make explicit archive switching possible. |
| Archive browsing / selection / deletion | `src/auto-reply/reply/commands-telegram-archives.ts` | Add current-chat-only archive listing, hash-style codes, and deletion. |
| Empty session detection | `src/auto-reply/reply/session.ts`, archive flow tests | Avoid archiving commands-only sessions. |
| LaTeX image fallback | `src/auto-reply/reply/latex-reply-image.ts`, `src/auto-reply/reply/get-reply.ts`, `src/auto-reply/reply/reply-media-paths.ts` | Render math into a single image when raw text would be hard to read or double-decoded. |
| Sanitized deployment docs | `docs/mychange/CHANGELOG.md`, `docs/mychange/AGENTS.md`, `docs/mychange/OPERATIONS.md`, `docs/mychange/OPENCLAW_ACCESS.md` | Preserve a private operator record without leaking host details. |
| Ignore private state | `.gitignore` | Keep secrets and local runtime state out of GitHub. |

## Concrete decisions

- OpenAI-style providers and Anthropic-style providers were split instead of multiplexed through a single generic provider name.
- The default model was changed to a provider that exists in the current environment instead of keeping a stale fallback.
- Telegram archives are chat-local only. The command should not browse other chats.
- A Telegram archive is only useful if it contains real user content. Empty command-only sessions should not be archived.
- Archive codes are short hashes, not rotating 1/2/3/4 numbers.
- `/new` in Telegram should archive the current chat and start fresh. It should not behave like a delete.
- The public docs should show the shape of the deployment, but never the real node or domain names.
- `/tg_*` command names are compatibility aliases, not the preferred user experience.
- `origin` is private working copy, `upstream` is official source of truth.
- The branch should preserve future rebase ability from upstream without reintroducing leaked local state.

## Why these changes were needed

- The gateway resolves secrets at startup. If one provider name still points to an unset env key, the whole process can restart-loop.
- Telegram and the gateway share session state. A reset command needs to understand whether it is archiving, switching, or really dropping state.
- Text-only LaTeX and Markdown were not reliable enough for the math-heavy replies that the operator wanted to keep sending.
- The repository was being used as a live deployment notebook, which meant access notes and local paths had to be rewritten before they were safe to push.
- Disk pressure from Docker cache was real enough to become an operational issue, so cleanup had to be part of the workflow.
- The earlier public push made the deployment notes themselves sensitive, even though the secrets were not all directly leaked.
- The branch history needed to be compact enough to ship, but the lost intermediate commit granularity should be acknowledged for future auditability.

## Pitfalls and failure modes

- `CUSTOM_ZZSHU_API_KEY` kept getting resolved even after the new provider set looked correct in the config file.
- `No available OAuth accounts in pool` showed that not all failures are provider config failures; some are auth-pool failures.
- `EmbeddedAttemptSessionTakeoverError` showed up during live model switching and pointed at session-lock contention, not a general Telegram bug.
- `Proxy headers detected from untrusted address` meant the reverse proxy trust boundary was wrong, not that the UI was broken.
- `Control UI did not start` was browser-side until proven otherwise.
- `Something went wrong while processing your request` was a generic failure wrapper, not a useful root cause.
- Docker build cache grew large enough that clearing it was part of the normal operating cycle.
- The build history was collapsed by amend, so the exact per-step commit sequence is no longer reproducible as separate commits.

## What was not fully solved

- The original step-by-step commit sequence is not fully reconstructable unless the dangling commit objects remain available.
- The current docs capture the behavior and the operational shape, but they are still not a full transcript of every failed rebuild or browser session.
- Archive navigation still lacks a fully polished "copy code / paste code" UX in Telegram.

## Current branch outcome

- Private `origin` points at the private GitHub repo.
- `upstream` still points at the official OpenClaw repository.
- The private repo has the sanitized doc set and the current feature work.
- The default agent model in the current runtime is `aitoken/claude-opus-4-6`.

## How to update this changelog

- Add each new requirement to the phase where the decision or implementation actually happened.
- Start a new phase when the work changes ownership boundary, risk level, or operating mode.
- Keep commit messages concise, then expand the changelog entry with the concrete files, decision, and pitfall.
- If a commit spans multiple concerns, document the split here even if Git history stays compact.
