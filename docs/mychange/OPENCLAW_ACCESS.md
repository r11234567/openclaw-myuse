# OpenClaw Access

This is the access map for the current private deployment. All hostnames, node names, and IPs are placeholders.

## Available routes

- Local gateway: `127.0.0.1:18789`
- Local nginx proxy: `127.0.0.1:8080`
- Public HTTPS: `https://<public-domain>/`

## Preferred order

1. Loopback while debugging.
2. Public nginx with ACME TLS when remote access is required.
3. Any future private overlay network should be documented here only after it is actually part of the active deployment.

## Public nginx path

Use nginx when you really want a public endpoint.

Requirements:

- TLS certificate
- gateway authentication enabled
- websocket upgrade headers preserved
- `allowedOrigins` updated for the public HTTPS name

The reverse proxy should point to the loopback gateway, not a public bind.
Do not assume public TLS alone makes the UI safe.

## ACME with Cloudflare DNS

When using `acme.sh` with DNS validation:

```bash
~/.acme.sh/acme.sh --issue --dns dns_cf -d <public-domain> -k ec-256
```

Then install the ECC cert into nginx and reload nginx.

Keep the Cloudflare credentials in the shell environment or a private profile file, not in Git.
Do not store the DNS token in the repo, even in a private runbook.

## Device pairing

If the gateway asks for device approval:

```bash
openclaw devices list
openclaw devices approve <request-id>
```

Approve once on the gateway host, then reconnect the browser or client.

## Telegram access

Telegram is restricted to the allowlisted user ID.

- bot token: stored in `.env`
- allowed user ID: one numeric Telegram user ID only

This means the bot is not intended for general public use.

## How to update this access map

- Update the route list first, then the nginx or certificate notes that make the route work.
- Keep real hostnames, node IDs, and IPs out of the file; use placeholders if the shape matters.
- If an access path is retired, remove it from the route list and record the retirement in `WORKLOG.md`.

## What to watch for

- If the UI loads but the app bundle never registers, try a clean browser profile first.
- If the gateway keeps restarting, check for missing provider env names.
- If a live model switch fails, treat it as a session/provider boundary problem, not as a UI issue.
- If you see `Something went wrong while processing your request`, inspect provider auth, session locks, and the runtime logs before trying a different browser or changing the bot text.
