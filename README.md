# OpenClaw deployment notes

Config root: `/home/srvtkuy/openclaw_config`

## Files

- `.env`: runtime secrets and provider URLs. Fill this before enabling Telegram or model providers.
- `docker-compose.yml`: Docker Gateway deployment. It does not publish `18789` to the host.
- `state/openclaw.json`: active OpenClaw config mounted as `/home/node/.openclaw/openclaw.json`.
- `config.d/*.json5`: split config files for easy inspection.
- `state/skills/finding-skills/SKILL.md`: local managed skill loaded from `/home/node/.openclaw/skills`.
- `nginx/openclaw.conf`: source copy for `/etc/nginx/sites-available/openclaw.example.conf`.
- `config.d/web-search.json5`: SearXNG primary with Google PSE fallback when SearXNG is unreachable.

## Fill Before Enabling

OpenClaw substitutes `${ENV}` references strictly. Empty values make config load fail.

1. Fill `.env`:
   - `OPENCLAW_GATEWAY_TOKEN`
   - `GOG_KEYRING_PASSWORD`
   - `TELEGRAM_BOT_TOKEN`
   - `OPENCLAW_TELEGRAM_ALLOW_FROM`
   - Provider `*_BASE_URL` and `*_API_KEY`
   - Google PSE key and search engine id

## Build/Deploy Flow

1. Push repository changes to `origin`.
2. Manually run GitHub Actions workflow `Manual OpenClaw Image`.
3. Use image tag `ghcr.io/r11234567/openclaw:manual` or update `.env` to the pushed tag.
4. Start after the image exists:

```bash
cd /home/srvtkuy/openclaw_config
docker compose pull
docker compose up -d
sudo nginx -t
sudo systemctl reload nginx
```

## Deployment Summary

- This setup keeps rebuild-safe skill/tool state in `state/skills/` and `state/tools/`.
- The deployed image is pulled from GHCR, then `docker compose up -d --force-recreate` switches the stack to that tag.
- If startup fails after a restart, check `config.d/*.json5` for stale config keys before blaming the image.
- To add skills later, put persistent skill files under `state/skills/` or install them into the managed OpenClaw skill root; do not rely on a one-off container build layer.

## Session Changes

- Telegram and Gateway share the same session registry; Telegram does not keep a private session layer.
- `/new` lifecycle-archives the old session and starts a fresh active session. Archived sessions keep stable 5-character codes for Telegram switching.
- `/sessions` shows shared sessions with short code, local time, status, and title; recent activity sorts first.
- `/switch`, `/rename`, `/cold`, and `/delete` operate on the shared session entry.
- Cold storage is irreversible for chat reuse, clears delivery context, and keeps the transcript for memory/dreaming. Delete removes the session entry and transcript file.
- Gateway session lists hide cold sessions and filter empty sessions from normal results.

## Network

OpenClaw Gateway is fixed at Docker internal IP `172.30.30.10:18789`.
Nginx proxies to that address. There is no `127.0.0.1:18789` port publication in the new compose file.
