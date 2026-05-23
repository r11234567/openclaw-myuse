# OpenClaw Access

All concrete hostnames, IPs, and node IDs should stay out of Git.

## Routes

- Gateway: `127.0.0.1:18789`
- Bridge: `127.0.0.1:18790`
- Local nginx: `127.0.0.1:8080`
- Local SearXNG: `127.0.0.1:${SEARXNG_HOST_PORT:-18080}`
- Public HTTPS: `https://<public-domain>/`

## Order

1. Use loopback while debugging.
2. Use authenticated nginx plus ACME TLS for remote access.
3. Document any future overlay/tailnet route only after it is active.

## Public Nginx

Requirements:

- TLS certificate.
- Gateway authentication enabled.
- Websocket upgrade headers preserved.
- `allowedOrigins` matches the public HTTPS origin.
- Proxy targets the loopback gateway, not a public app bind.

TLS alone is not security.

## ACME

```bash
~/.acme.sh/acme.sh --issue --dns dns_cf -d <public-domain> -k ec-256
```

Install the ECC cert into nginx and reload nginx. Keep DNS tokens out of the repo.

## Telegram

Telegram is allowlist-only:

- bot token in `.env`
- one numeric `TELEGRAM_ALLOWED_USER_ID`

## Device Pairing

```bash
openclaw devices list
openclaw devices approve <request-id>
```

Approve from the gateway host, then reconnect the client.
