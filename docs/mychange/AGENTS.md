# Branch Notes

## Architecture snapshot

- One Docker image serves both Gateway and CLI.
- Runtime state lives outside the repo in `~/.openclaw`.
- Provider resolution happens from env + config at startup.
- Telegram, the Control UI, and the gateway share the same session graph.
- Provider/model switches are not always live-safe; some changes still need a gateway restart.
- The repo has two remotes:
  - `origin` = private working repo
  - `upstream` = official OpenClaw repo

## User preferences captured in this branch

- Use Docker for the runtime.
- Keep the CLI around for later frontend integrations.
- Leave room for future agent and MCP expansion.
- Allow Telegram only for the approved user, not for everyone.
- Keep the visible Telegram surface in Chinese when practical.
- Prefer rendered image fallback for LaTeX if raw math or markdown is not reliable.
- Avoid exposing the gateway blindly; prefer loopback, tailnet, or authenticated proxying.
- Keep the private origin separate from upstream so official patches can still be pulled cleanly.

## Pitfalls that showed up

- Stale provider env names will break startup even when the rest of the stack is healthy.
- A successful Docker build does not mean the gateway is usable; startup logs still need to be checked.
- Browser extensions or early scripts can make the Control UI look blank even when the backend is fine.
- Tailscale Serve and MagicDNS need the exact origin added to the gateway allowlist.
- Telegram session resets can become destructive if `/new` is treated like delete instead of archive.
- Direct conversation-driven model switching can fail when the runtime still needs a restart or an auth profile is missing.
- Build cache can consume a lot of disk; prune it after big rebuilds.

## Half-finished work to keep in mind

- Better archive browsing and switching for Telegram sessions.
- Stable short session hashes instead of rotating numeric labels.
- More complete Chinese command help and menu text.
- Better handling for empty sessions so they are not archived.
- A cleaner story for switching providers and models without making the operator restart the gateway every time.

## Practical operating rules

- Prefer simple, explicit runtime changes over hidden fallback behavior.
- Keep sensitive local notes out of committed history unless they are sanitized first.
- When provider config changes, validate the gateway logs and health rather than assuming the build fixed it.
- When pushing branch updates, keep `origin` private and rebase from `upstream/main` when official fixes are needed.

