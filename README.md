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

## Network

OpenClaw Gateway is fixed at Docker internal IP `172.30.30.10:18789`.
Nginx proxies to that address. There is no `127.0.0.1:18789` port publication in the new compose file.
