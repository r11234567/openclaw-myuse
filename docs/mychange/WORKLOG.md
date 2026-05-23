# OpenClaw Worklog

High-frequency operational log for this private deployment.
Check this first when something breaks, a rebuild changes behavior, or a deployment step needs to be replayed.

## 2026-05-19: bootstrap and first deployment path

- Started from the Hetzner install flow and kept the Gateway plus CLI in one Docker-based runtime.
- Chose Docker as the stable operator path instead of scattering setup across local installs.
- Kept the private `origin` separate from the official `upstream` so local changes could be pushed without losing the rebase path.
- Configured provider endpoints with explicit base URL plus API key pairs instead of assuming a standard provider shape.
- Wired Telegram as a controlled operator channel instead of a general public bot.
- The public exposure plan used nginx plus ACME DNS validation with Cloudflare rather than SSH tunnels.
- The Gateway Control UI needed browser/device approval at least once from the host before the browser could trust it.
- Source-code work that made this possible is summarized in `CHANGELOG.md` Phase 5.

## 2026-05-20: Telegram, math replies, and session behavior

- Reproduced the case where Telegram and the Gateway were showing unreadable or half-rendered replies.
- Decided to render math-heavy replies as a single image instead of trying to make every formula survive transport markup unchanged.
- Found that Chinese glyph quality and mixed text/formula layout mattered more than preserving raw LaTeX syntax.
- Observed that `/new` behavior needed to archive the current Telegram conversation instead of deleting it.
- Added archive browsing, archive switching, and archive deletion as distinct actions so the user could recover older chats.
- Kept the archive list limited to the current Telegram chat so the bot would not surface unrelated sessions.
- The generic `Something went wrong while processing your request` wrapper was not useful as a diagnosis by itself; the useful work was to inspect provider, session, and auth logs.
- Source-code work that implements this behavior is in `CHANGELOG.md` Phases 1 through 4.

## 2026-05-20: access and certificate work

- Provisioned an ECC Let’s Encrypt certificate with `acme.sh` and Cloudflare DNS validation for public HTTPS.
- Installed the cert into the nginx layer and kept the Gateway behind the proxy instead of binding the app directly to the internet.
- Verified that proxy headers and trusted origin settings had to line up with the real nginx host name.
- Rechecked the Control UI failure mode and treated a blank or partial UI as a browser/runtime issue until logs proved otherwise.
- Public exposure stayed behind authentication; TLS alone was not treated as security.
- The relevant source work is still the session and command handling in `CHANGELOG.md` Phases 1, 2, and 5.

## 2026-05-20: disk pressure and rebuild hygiene

- Docker build cache became large enough to matter, so cleanup became part of the normal operating cycle.
- Avoided unnecessary rebuilds while the machine was already resource constrained.
- Tracked the difference between runtime state, repo state, and build cache so the wrong cleanup command would not erase useful state.
- When rebuilds were required, the post-build logs had to be checked before treating the deployment as healthy.
- Any future rebuild record should go here with the exact reason, timestamp, and result.

## 2026-05-21: docs split and repo hygiene

- Split the private docs into role-specific files so future sessions can decide where to look without re-reading everything.
- Sanitized host-specific names, node IDs, and domain details out of the committed operator docs.
- Kept the private repo as the push target while preserving the official upstream as the rebase source.
- Added local ignore rules for runtime state and other machine-specific files so the repository stays safe to push.
- The README was rewritten to describe the private deployment instead of mirroring the upstream marketing page.

## 2026-05-22: zzshu provider surface cleanup

- Simplified the private provider surface so `zzshu-claude` and `zzshu-gpt` remain as separate entries, while the single `zzshu` wrapper is no longer presented as an active provider.
- Reconciled `OPENCLAW_ACCESS.md` with the current provider list so the operator docs match the runtime config again.
- Restarted the Gateway after the config refresh and verified that the service came back healthy with the expected provider set.
- The main follow-up is to keep the operator docs and the runtime config aligned whenever the provider list changes again.

## 2026-05-22: LaTeX image CJK font diagnosis

- Investigated Telegram math replies that sometimes rendered as raw text, sometimes as PNG, and sometimes produced a generic request failure after the PNG was generated.
- Confirmed that the source path for math-heavy replies is `src/auto-reply/reply/latex-reply-image.ts`, and that the Docker runtime is expected to include `fontconfig` plus `fonts-noto-cjk`.
- Confirmed the local shell did not expose `fc-match` or CJK fonts, while the committed Dockerfile already installs the required packages; the practical fix is to rebuild/redeploy the runtime image rather than only changing prompt wording.
- Added a CJK font probe to the LaTeX reply renderer so future boxed-Chinese failures leave an explicit verbose log that points at missing `fontconfig` or `fonts-noto-cjk`.
- Follow-up: after pulling this change on the host, rebuild the Docker image and restart the Gateway, then send a Chinese-plus-formula Telegram test reply and check that the text is not rendered as boxes.

## 2026-05-22: Telegram menu localization and archive code stabilization

- Fixed Telegram command menu language-code handling so `zh-CN` localized descriptions can actually reach `setMyCommands`.
- Reworked the Telegram archive identifiers to stay at a fixed 5-character hash and stopped the code from growing longer when collisions appear.
- Tightened the archive usage copy so the `/archives` path makes the 5-character code requirement explicit.
- The operational follow-up is to re-register the Telegram menu after the next restart and confirm the localized descriptions show in the bot command list.

## 2026-05-22: Docker rebuild after Telegram menu/archive fixes

- Rebuilt the local `docker compose` gateway image after the Telegram menu localization and archive-code changes landed.
- The rebuild completed successfully and the `openclaw-gateway` container was recreated from the fresh image.
- The runtime image path already includes `fontconfig` and `fonts-noto-cjk`, so this rebuild also keeps the math-image rendering fix in the deployed container.
- Follow-up: keep the gateway logs handy for the next Telegram command-menu or archive-session check, since the new image is now the source of truth on this host.

## 2026-05-23: skill installer docs and source sync

- Updated the source and operator docs to reflect apt-capable skill installs and the Linux `gh` branch in `skills/github/SKILL.md`.
- Kept runtime package installation inside the Dockerfile instead of doing ad hoc installs in the running container.
- Avoided a Docker rebuild for this pass; the work stayed at the source and docs layer.
- Committed the source changes and pushed the branch to `origin/my-changes`.

## What to log here next

- Any Docker build, rebuild, or prune that changes the runtime image.
- Any nginx, ACME, or certificate change.
- Any provider, Telegram, or Gateway config edit that required a restart.
- Any proxy, access, or authentication change.
- Any failure with a useful timestamp, exact symptom, and the file or command that fixed it.
- Any skill installer change that affects runtime prerequisites, install metadata, or operator-facing skill availability.

## How to update this worklog

- Add entries in chronological order and keep them operational, not theoretical.
- Include the exact action, the result, and any follow-up that still matters.
- If the entry corresponds to source code work, add the matching `CHANGELOG.md` phase reference.
- Never write secrets or real host fingerprints here; use placeholders if a value matters for understanding the event.
