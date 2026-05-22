# Source Change Log

This file records source-code changes only.
Deployment steps, rebuild history, certificate work, proxy setup, and other operator notes belong in `WORKLOG.md`.

## Phase 1: session lifecycle and reset semantics

- `src/auto-reply/reply/session.ts` now decides more explicitly when a turn becomes a fresh session, a reuse, or an archive rollover.
- `src/auto-reply/reply/commands-reset.ts`, `src/auto-reply/reply/commands-reset-hooks.ts`, and the related session reset files translate `/new` and `/reset` into the session state machine instead of treating them as plain text commands.
- Empty command-only turns are guarded so they do not become useless archives.
- The design decision was to preserve recoverability: archive on `/new`, do not silently delete the prior conversation.
- The main failure mode here was session-lock and takeover contention during live model switching, so the code had to surface the real boundary instead of hiding it behind a generic Telegram failure.

## Phase 2: Telegram archive commands and command surface

- `src/auto-reply/reply/commands-telegram-archives.ts` owns archive listing, archive switching, current-chat filtering, and archive deletion.
- Short hash-style archive codes replaced the old rotating numeric labels so the user can copy and paste a stable identifier, and the code now stays fixed at 5 characters.
- The command surface was kept chat-local: Telegram should only see archives created in that Telegram flow, not gateway-created sessions from elsewhere.
- Compatibility aliases such as `/tg_*` remain available, but they are only aliases; the human-facing command surface stays centered on the plain Telegram commands.
- Tests around archive listing, current-chat filtering, and delete behavior were kept close to the handler so the chat-local contract stays visible.

## Phase 3: localized command registry and Telegram UX

- `src/auto-reply/commands-registry.shared.ts`, `src/auto-reply/commands-localization.ts`, and `src/auto-reply/commands-text-routing.ts` carry the command metadata and the localized command text.
- The visible Telegram command menu and replies were adjusted toward Chinese where the surface is user-facing, and Telegram menu sync now accepts `zh-CN` description localizations.
- The choice was to localize stable user-facing command text while keeping internal aliases and handler names intact for compatibility.
- The risk here was drift between the command registry, the menu, and the reply copy, so the registry and localization layers stayed aligned.

## Phase 4: math reply rendering

- `src/auto-reply/reply/latex-reply-image.ts` renders LaTeX-heavy replies into a single PNG when raw text would be hard to read or too fragile for downstream transport.
- `src/auto-reply/reply/get-reply.ts` routes replies through the media fallback when the content demands it.
- The renderer now probes `fontconfig` for a CJK-capable font before generating Chinese-containing formula images and logs a concrete runtime hint when CJK fonts are missing.
- The decision was not to keep forcing Telegram markdown or browser-side math parsing to carry every formula.
- Mixed text and formula output still needs careful layout tuning, but the code path now prefers a readable image over broken markup.
- The known risk is CJK glyph quality and cramped layout when the runtime image is stale or missing the expected CJK fonts.

## Phase 5: provider configuration and startup behavior

- `src/config/config.ts`, `src/config/io.ts`, and the provider/model catalog code were updated so non-standard providers can be wired as explicit OpenAI-compatible or Anthropic-compatible entries.
- The provider model set was made explicit instead of relying on stale env names or stale defaults.
- The default model was moved to the working provider that matches the current runtime configuration.
- The important design choice was fail-fast startup: a missing or mismatched provider secret should stop the Gateway early rather than allow a misleading partial boot.
- The main pitfall was that a config file can look correct while the runtime still resolves an old env key or a missing auth profile.

## Phase 6: tests and guard rails

- The session, archive, localization, and reply-rendering code paths were backed by focused tests instead of only end-to-end smoke checks.
- The tests are there to lock in the command flow, not to freeze every visible string.
- This branch prefers small tests around command/session boundaries because that is where the regressions kept appearing.

## Concrete decisions

- `/new` archives the current Telegram conversation instead of deleting it.
- Empty command-only sessions do not deserve archive slots.
- Archive codes should be short and stable enough to copy directly.
- Telegram-only compatibility aliases should exist, but they should not define the mental model of the feature.
- Markdown and browser math parsing are not reliable enough to be the only reply format for LaTeX-heavy answers.
- Provider startup must fail visibly if the config points at the wrong env names.
- Live model switching is not guaranteed to succeed if the session is pinned or the auth state is wrong, so the code should not pretend otherwise.

## Pitfalls that shaped the code

- Generic failures such as `Something went wrong while processing your request` were too vague to treat as a root cause.
- Provider and session errors can look like Telegram problems even when the real boundary is the model/config layer.
- A successful build does not mean the Gateway is healthy.
- Browser UI startup issues are not always backend issues.
- Short archive IDs are more usable than rotating integers, but they need good command-menu text to stay discoverable.

## How to update this changelog

- Put each new source change under the phase where the code decision actually happened.
- Start a new phase when the module boundary, risk surface, or runtime behavior changes.
- Keep deployment history out of this file; add that to `WORKLOG.md` instead.
- When a worklog entry mentions a source change, point it back here by phase name.
