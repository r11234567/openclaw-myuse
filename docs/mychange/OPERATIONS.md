# OpenClaw Operations

This runbook is for the current private working copy.

## Layout

- Repository: `$HOME/openclaw`
- Runtime state: `$HOME/.openclaw`
- Workspace: `$HOME/.openclaw/workspace`
- Local secrets: `$HOME/openclaw/.env`
- Private origin: private GitHub repo
- Upstream: official OpenClaw repo

## Secrets

Populate at least one working provider set before starting the gateway:

- OpenAI-compatible providers: `*_BASE_URL` + `*_API_KEY`
- Anthropic-compatible providers: `*_BASE_URL` + `*_API_KEY`
- Telegram: `TELEGRAM_BOT_TOKEN`
- Telegram access control: `TELEGRAM_ALLOWED_USER_ID`

Do not commit `.env`, `.acme.sh`, cert material, or `~/.openclaw`.

## Provider shape

- OpenAI-compatible providers should use the `openai-completions` API shape.
- Anthropic-compatible providers should use the `anthropic-messages` API shape.
- Keep model IDs aligned with the upstream provider catalog.
- If a provider is missing or renamed, fix the config first and restart the gateway instead of trying to force a live switch through chat.

## Build and run

```bash
cd $HOME/openclaw
docker compose build
docker compose up -d openclaw-gateway
docker compose logs -f openclaw-gateway
```

Useful health checks:

```bash
docker compose ps
docker compose logs --tail 100 openclaw-gateway
docker system df -v
```

Cache cleanup after large rebuilds:

```bash
docker builder prune -af
```

## Git flow

Keep the two remotes separate:

- `origin` -> private branch copy
- `upstream` -> official OpenClaw repository

To sync official fixes, fetch from upstream and rebase the working branch, then push back to `origin`.

```bash
git fetch upstream
git rebase upstream/main
git push origin my-changes
```

## Local access

The safest default is loopback-only gateway access:

- Gateway: `127.0.0.1:18789`
- Local nginx proxy: `127.0.0.1:8080`

This keeps the Gateway off the public interface while still allowing browser access from the host.

## Public HTTPS

If you need public exposure, use nginx plus a certificate and keep gateway authentication on.

Recommended certificate flow:

```bash
~/.acme.sh/acme.sh --issue --dns dns_cf -d <domain> -k ec-256
~/.acme.sh/acme.sh --install-cert -d <domain> --ecc \
  --key-file /etc/nginx/ssl/<domain>.key \
  --fullchain-file /etc/nginx/ssl/<domain>.fullchain.pem \
  --reloadcmd "systemctl reload nginx"
```

Basic nginx proxy requirements:

- preserve `Upgrade` and `Connection` headers
- forward `X-Forwarded-Proto https`
- keep `client_max_body_size` and timeout values large enough for chat uploads
- do not disable gateway authentication just because TLS exists

## Tailscale

Private tailnet access is the easiest way to avoid public exposure.

```bash
sudo tailscale serve --https=443 http://127.0.0.1:8080
sudo tailscale serve status
sudo tailscale status --json | jq -r '.Self.DNSName'
```

If the Control UI shows origin issues, add the tailnet HTTPS name to `gateway.controlUi.allowedOrigins` and restart the gateway.

## Telegram

Telegram is restricted by allowlist.

- `dmPolicy: "allowlist"`
- `groupPolicy: "allowlist"`
- `allowFrom: ["${TELEGRAM_ALLOWED_USER_ID}"]`
- `groupAllowFrom: ["${TELEGRAM_ALLOWED_USER_ID}"]`

If Telegram reports a generic runtime failure, check the gateway logs first. The common root causes in this branch were:

- stale provider names
- missing provider secrets
- session takeover during a live model change
- missing auth profiles

## Common failures

- `Proxy headers detected from untrusted address`: the reverse proxy is not trusted by the gateway config or the proxy is not actually coming from loopback.
- `Control UI did not start`: browser-side module execution got blocked or the bundle failed to register.
- `Something went wrong while processing your request`: usually a session / auth / provider startup problem, not a special Telegram-only error.
- `Device pairing required`: approve the device once from the gateway host, then reconnect.

