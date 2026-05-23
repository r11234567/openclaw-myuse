# OpenClaw Worklog

Operational history for this private deployment. Keep it short: action, result, and follow-up.

## Timeline

- 2026-05-19: Bootstrapped the private Docker deployment with Gateway and CLI in one image. Configured explicit provider endpoints and Telegram as the controlled operator channel.
- 2026-05-20: Implemented recoverable Telegram session behavior: `/new` archives, archive list/switch/delete works, and archives are limited to the current Telegram chat.
- 2026-05-20: Added image fallback for LaTeX-heavy replies after raw Telegram/Markdown output proved fragile.
- 2026-05-20: Set up public HTTPS shape with nginx plus ACME DNS validation; Gateway remains behind authentication.
- 2026-05-21: Split private docs by role and sanitized host-specific details.
- 2026-05-22: Cleaned up private provider surface so the active provider list matches runtime config.
- 2026-05-22: Added CJK font diagnostics for LaTeX image rendering and rebuilt the Docker runtime after Telegram menu/archive fixes.
- 2026-05-23: Added apt-capable skill installer metadata and Linux `gh` support; runtime dependencies belong in Dockerfile, not ad hoc container installs.
- 2026-05-23: Added local SearXNG service and set search order to SearXNG, DuckDuckGo MCP, Google Custom Search, then Apify fallback.
- 2026-05-23: Rebased private branch onto official `v2026.5.20` and pushed the rewritten `origin/my-changes`.
- 2026-05-23: Rebuilt `openclaw:latest`, recreated `openclaw-gateway`, cleared BuildKit cache, and verified version `2026.5.20`, `/healthz`, SearXNG, and requested skill binaries.

## Current Runtime

- OpenClaw: `2026.5.20`
- Gateway container: `openclaw-gateway`, healthy after rebuild.
- Search: SearXNG at `http://searxng:8080` inside Compose.
- Runtime skill binaries verified: `gh`, `jq`, `rg`, `ffmpeg`, `clawhub`, `mcporter`, `nano-pdf`.

## Log Next

- Docker rebuilds, restarts, and cache pruning that change runtime behavior.
- Provider, Telegram, Gateway, nginx, ACME, or auth changes.
- Failures with exact symptoms and the command or file that fixed them.
