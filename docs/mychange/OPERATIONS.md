# OpenClaw Operations

This runbook is for the current private working copy.

## Layout

- Repository: `$HOME/openclaw`
- Runtime state: `$HOME/.openclaw`
- Workspace: `$HOME/.openclaw/workspace`
- Local secrets: `$HOME/openclaw/.env`
- Private origin: private GitHub repo
- Upstream: official OpenClaw repo

## What this branch expects

- Docker is the supported runtime path.
- The Gateway and CLI come from the same image.
- Provider config is runtime-critical, not just documentation.
- The private repo is the place to push local branch work.
- Upstream is the place to fetch official fixes from.

## Secrets

Populate at least one working provider set before starting the gateway:

- OpenAI-compatible providers: `*_BASE_URL` + `*_API_KEY`
- Anthropic-compatible providers: `*_BASE_URL` + `*_API_KEY`
- Telegram: `TELEGRAM_BOT_TOKEN`
- Telegram access control: `TELEGRAM_ALLOWED_USER_ID`
- Cloudflare DNS API credentials for ACME DNS validation

Do not commit `.env`, `.acme.sh`, cert material, or `~/.openclaw`.
If a secret appears in any public commit, rotate it rather than relying on `.gitignore`.

The practical secret set for this branch was:

- gateway token / password
- Telegram bot token
- Telegram allowlisted user ID
- provider base URLs and keys
- Cloudflare DNS API credentials

## Provider shape

- OpenAI-compatible providers should use the `openai-completions` API shape.
- Anthropic-compatible providers should use the `anthropic-messages` API shape.
- Keep model IDs aligned with the upstream provider catalog.
- If a provider is missing or renamed, fix the config first and restart the gateway instead of trying to force a live switch through chat.
- If a chat-driven model switch reports a generic failure, check for:
  - stale provider env names
  - missing auth profiles
  - session file lock or takeover errors
  - a restart loop caused by a missing provider key

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
docker compose exec openclaw-gateway openclaw gateway status --deep
docker system df -v
```

Useful inspection commands:

```bash
docker compose logs --tail 200 openclaw-gateway | grep -E 'Gateway failed to start|SECRETS_RELOADER_DEGRADED|session file changed|No available OAuth accounts|ready'
docker compose exec openclaw-gateway env | grep -E 'CUSTOM_|DEEPSEEK_|MOONSHOT_|TELEGRAM_|OPENCLAW_'
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

If the branch gets behind but you do not want to merge histories, keep rebasing the private branch instead of changing `upstream`.
The private branch should stay a clean replayable line, not a merge bucket.

## Local access

The safest default is loopback-only gateway access:

- Gateway: `127.0.0.1:18789`
- Local nginx proxy: `127.0.0.1:8080`

This keeps the Gateway off the public interface while still allowing browser access from the host.
If you need remote access, use authenticated nginx with ACME TLS and keep gateway auth on.
If the gateway must bind beyond loopback, make sure the auth mode is still enabled and the trusted proxy list matches the real proxy IPs.

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
- do not assume public TLS alone makes the UI safe

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
- the command pipeline deciding to reset or archive the session before the model call

If the bot becomes noisy or returns the wrong language, inspect the Telegram command registry and reply localization layer before blaming the bot token.

## Common failures

- `Proxy headers detected from untrusted address`: the reverse proxy is not in the trusted-proxy set or traffic is not really flowing through the expected proxy.
- `Control UI did not start`: frontend bundle execution is blocked or incomplete, even if the static page loads.
- `Something went wrong while processing your request`: usually a session, auth, or provider startup problem, not a special Telegram-only error.
- `Device pairing required`: approve the device once from the gateway host, then reconnect.
- `session file changed while embedded prompt lock was released`: a live model-switch or embedded execution path stepped on the session lock boundary.
- `No available OAuth accounts in pool`: auth provisioning is missing, not a model catalog problem.

## How to update this runbook

- Add a command here when it is used to recover, verify, or rebuild the current deployment.
- Keep commands grouped by the problem they solve, not by the order they were discovered.
- If a command starts failing, update the note with the new failure signature and move the deeper explanation to `WORKLOG.md`.
