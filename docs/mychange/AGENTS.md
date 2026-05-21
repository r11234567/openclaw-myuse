# Branch Notes

## Architecture snapshot

- Gateway and CLI share one Docker image, so runtime changes, provider changes, and command handling are exercised in the same container.
- Durable state lives in `~/.openclaw`, not in the repo.
- Provider resolution is startup-driven. A stale env name or a missing provider secret can stop the gateway before the UI or Telegram sidecar fully comes up.
- The command pipeline is roughly:
  1. raw inbound text is normalized
  2. commands are matched in the registry
  3. authorization is checked
  4. session state is initialized or reset
  5. command handlers can short-circuit or let the model run
  6. the reply pipeline can postprocess the text into media
- `getReplyFromConfig` is the main entry for reply generation.
- `initSessionState` is where `/new`, `/reset`, stale-session reuse, archive rollover, and session metadata converge.
- `handleTelegramArchivesCommand` owns `/archives`, `/use`, `/delete`, and `/current`.
- The session store is the real source of continuity. The command text is only the trigger.
- Telegram, the gateway UI, and command handlers all share the same underlying session graph, so changing one channel can affect the others.
- `src/auto-reply/reply/session.ts` is the best place to reason about whether a turn becomes a fresh session, a reuse, or an archived rollover.
- `src/auto-reply/reply/commands-reset.ts` is where the explicit `/new` and `/reset` surface is translated into session end behavior.
- `src/auto-reply/reply/commands-telegram-archives.ts` is where archive codes, current-chat filtering, and delete semantics live.
- `src/auto-reply/reply/latex-reply-image.ts` is the postprocessor that turns LaTeX-heavy replies into a single PNG when plain text is not enough.
- `src/auto-reply/reply/get-reply.ts` is the orchestrator that decides whether to refresh config, apply media understanding, or hand off to the reply pipeline.
- `src/auto-reply/commands-registry.shared.ts` is the command catalog source for slash command definitions and aliasing.

For build, run, and health-check commands, see OPERATIONS.md.

## Non obvious user preferences

- Use Docker for the runtime and keep the CLI installed inside the same image.
- Keep room for future agent and MCP expansion instead of hard-coding one-off shortcuts.
- Keep Telegram restricted to a single allowed user unless the user explicitly opens it up.
- Prefer Chinese replies and Chinese command affordances in Telegram when the feature is already user-facing.
- Prefer image fallback for math-heavy replies instead of trying to make raw Markdown and LaTeX do all the work.
- Prefer explicit archive / switch / delete semantics over implicit session deletion.
- Keep the private working repo separate from the official upstream repo.
- Do not assume live chat-driven model switching is safe. If the runtime still requires a restart or an auth profile fix, say so directly.
- Do not pretend a successful build means the service is healthy. Read the startup logs and health output.
- Do not add large hidden compatibility layers just to keep old behavior alive when the runtime contract can be made explicit.
- When a command is only needed for Telegram compatibility, keep the compatibility alias but do not center the user experience on it.
- Do not turn host-specific operator notes into generic docs without stripping the host identity first.
- Avoid turning a generic failure string into a fake diagnosis.
- Keep test coverage focused around the command and session flow, not only around surface strings.
- Short, unique session codes are preferred over rotating numeric labels because they are easier to copy and less ambiguous.

## Error handling stance

- If a provider secret is missing, fail the startup path instead of silently limping along.
- If a live model switch collides with a locked session file or provider auth gap, surface the real cause instead of inventing a generic Telegram-only explanation.
- If browser-side UI startup is broken, treat it as a runtime or extension issue until proven otherwise.
- If LaTeX cannot stay readable as text, switch to rendered media instead of trying to squeeze more markup into the same message.
- If an archive is empty or only contains control commands, do not archive it.
- If a command is unauthorized, return early and do not try to partially execute it.
- If a live provider switch needs a restart or fresh auth state, say that explicitly rather than pretending the command can do it inline.
- If the gateway reports a generic request failure, inspect the provider/auth/session logs before adding special-case copy.

## Pitfalls that showed up

- Stale provider env names can survive across config edits and still break startup.
- A successful Docker build can still leave the gateway in a restart loop if runtime secrets are wrong.
- Control UI failures can be browser-side even when the backend is healthy.
- Tailscale Serve / public nginx need allowlist updates for the exact origin.
- `/new` needs to archive, not delete, or the user loses the conversation.
- Switching providers or models from inside a chat can fail because the session is still pinned to the old runtime/auth state.
- Docker build cache can become a real disk problem after repeated rebuilds.

## Concrete half-finished work

- `src/auto-reply/reply/commands-telegram-archives.ts`
  - archive browsing is implemented
  - archive selection and deletion work
  - short hash codes are used, but the UX still needs more ergonomic display and stable copy/paste handling
  - the list/delete UX still needs clearer "current chat only" wording in the visible command text
- `src/auto-reply/reply/session.ts`
  - `/new` and stale-session rollover preserve continuity
  - empty command-only sessions still need stronger guard rails in edge cases
  - the state machine around session reuse vs. archive rollover is the main place to inspect when new regressions appear
- `src/auto-reply/reply/latex-reply-image.ts`
  - LaTeX image rendering works for text replies
  - it still needs more human-friendly layout tuning for mixed text + formula output
  - Chinese glyph rendering and image layout quality are the next thing to revisit if output looks boxed or cramped
- `src/auto-reply/commands-registry.shared.ts`
  - command registration now carries more explicit metadata
  - the menu/help copy still needs fuller Chinese coverage where practical
  - the compatibility alias set should stay in sync with the human-facing command docs
- `docs/mychange/*`
  - current docs capture the branch shape, but they should be extended with concrete command examples and known failure signatures if this branch keeps evolving
  - they are sanitized, so any host-specific references must stay redacted or templated

## Specific command and session flow notes

- `getReplyFromConfig` can refresh config from disk when the inbound text is a model-related command.
- `initSessionState` strips structural metadata, checks reset triggers, and decides whether the turn starts a new session or continues an existing one.
- `/new` and `/reset` share the same flow until explicit reset semantics split them at the command layer.
- Telegram archive commands are parsed in the reply layer, not in the generic command registry.
- Empty command-only sessions should be filtered before archiving.
- The session store is updated after the session file path is resolved, so the file system and the in-memory store need to stay aligned.
- The LaTeX image postprocessor is downstream of reply generation, so it should be treated as a formatting fallback, not as the primary reasoning path.

## Practical operating rules

- Prefer simple explicit runtime changes over hidden fallback behavior.
- Validate with logs and health checks after provider changes.
- Keep sensitive local notes out of committed history unless they are sanitized first.
- Keep `origin` private and `upstream` official.
- When the operator says "push", it should go to the private branch unless explicitly told to upstream.
