# OpenClaw Operations

## Layout

- Repo: `$HOME/openclaw`
- State/workspace: `$HOME/.openclaw`
- Secrets: `$HOME/openclaw/.env`
- Private remote: `origin`
- Official remote: `upstream`

## Start And Rebuild

```bash
cd $HOME/openclaw
docker compose build openclaw-gateway
docker compose up -d openclaw-gateway searxng
docker compose logs -f openclaw-gateway
```

After large builds:

```bash
docker builder prune -f
docker system df
```

## Image Publishing

CI publishes `ghcr.io/<owner>/openclaw-myuse`.

- Normal trigger: increment `build_revision` in `docs/mychange/IMAGE_BUILD_TRIGGER.md` and push to `main`.
- Manual trigger: run `Build and Publish openclaw-myuse` with `publish=1`.

## Health

```bash
docker compose ps
docker compose exec -T openclaw-gateway node -p "require('./package.json').version"
docker compose exec -T openclaw-gateway node -e "fetch('http://127.0.0.1:18789/healthz').then(async r=>console.log(r.status, await r.text()))"
docker compose logs --tail 120 openclaw-gateway
```

## Search

SearXNG runs inside Compose and is exposed only on loopback for local testing.

```bash
docker compose up -d searxng
curl "http://127.0.0.1:${SEARXNG_HOST_PORT:-18080}/search?q=openclaw&format=json"
docker compose exec -T openclaw-gateway node -e "fetch('http://searxng:8080/search?q=openclaw&format=json').then(async r=>console.log((await r.json()).results?.length))"
```

## Git

```bash
git fetch upstream --tags
git rebase v<stable-version>
git push --force-with-lease origin my-changes
```

Use `origin` for private branch work and `upstream` only for official sync.

## Secrets

- Providers: `*_BASE_URL` plus `*_API_KEY`
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`
- Search: `SEARXNG_*`, optional `GOOGLE_SEARCH_*`, optional `APIFY_API_TOKEN`
- ACME/Cloudflare credentials stay outside Git.

Never commit `.env`, cert material, auth profiles, or `~/.openclaw`.

## Common Failures

- Gateway restart loop: check provider env names and secrets.
- Generic Telegram failure: inspect provider/auth/session logs first.
- Browser UI incomplete: verify runtime/frontend logs before changing Telegram text.
- Live model switch fails: treat as session/provider/auth boundary.
- Disk pressure: prune BuildKit cache after rebuilds.
