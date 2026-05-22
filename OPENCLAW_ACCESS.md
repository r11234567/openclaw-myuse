# OpenClaw Access Runbook

Current local services:

- OpenClaw Gateway: `127.0.0.1:18789`
- Nginx local reverse proxy: `127.0.0.1:8080`
- Tailscale node IP: `<tailscale-ip>`
- Tailscale DNS name: `<tailscale-dns-name>`
- Tailscale node name shown by `tailscale status`: `<tailscale-node-name>`

## Tailscale HTTPS inside tailnet

Tailscale Serve is the simplest way to get an internal HTTPS URL without managing cert files in nginx.

1. Enable Serve for this node/tailnet.

   Open the URL printed by the failed command:

   ```text
   https://login.tailscale.com/f/serve?node=<node-id>
   ```

   If that link expires, rerun:

   ```bash
   sudo tailscale serve --https=443 http://127.0.0.1:8080
   ```

2. After enabling Serve in the browser, run:

   ```bash
   sudo tailscale serve --https=443 http://127.0.0.1:8080
   sudo tailscale serve status
   ```

3. Open the MagicDNS HTTPS name from a device in the same tailnet:

   ```text
   https://<tailscale-dns-name>/
   ```

   Find the exact tailnet suffix:

   ```bash
   sudo tailscale status --json | jq -r '.Self.DNSName'
   ```

4. If the browser UI reports origin/auth problems, add the exact URL to `gateway.controlUi.allowedOrigins` in:

   ```text
   $HOME/.openclaw/openclaw.json
   ```

   Example:

   ```json5
   gateway: {
     controlUi: {
       allowedOrigins: [
         "http://localhost:18789",
         "http://127.0.0.1:18789",
         "https://<tailscale-dns-name>",
       ],
     },
   }
   ```

   Then restart:

   ```bash
   cd $HOME/openclaw
   docker compose restart openclaw-gateway
   ```

## DNS checks

From any tailnet device:

```bash
tailscale status
tailscale ping <tailscale-node-name>
nslookup <tailscale-node-name>.<your-tailnet>.ts.net
```

On this server:

```bash
sudo tailscale status
sudo tailscale ip -4
sudo tailscale status --json | jq -r '.Self.DNSName'
```

If MagicDNS names do not resolve:

1. Open the Tailscale admin console.
2. Go to DNS.
3. Enable MagicDNS.
4. Confirm HTTPS certificates are enabled if Serve prompts for it.

## Nginx local reverse proxy

The installed nginx site is:

```text
/etc/nginx/sites-available/openclaw
```

It listens only on:

```text
127.0.0.1:8080
```

and proxies to:

```text
127.0.0.1:18789
```

Validate:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo curl -I http://127.0.0.1:8080/
```

## Public nginx exposure

Public exposure is possible but higher risk than Tailscale Serve.

Minimum requirements:

- Real domain, for example `openclaw.example.com`
- TLS certificate, usually via certbot
- `gateway.controlUi.allowedOrigins` contains `https://openclaw.example.com`
- Keep `gateway.auth.mode: "token"` or switch to a properly configured identity-aware trusted proxy
- Preserve WebSocket `Upgrade` headers

Recommended nginx public server shape:

```nginx
server {
    listen 443 ssl http2;
    server_name openclaw.example.com;

    ssl_certificate /etc/letsencrypt/live/openclaw.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/openclaw.example.com/privkey.pem;

    client_max_body_size 50m;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
```

## Provider setup

The active providers in `$HOME/.openclaw/openclaw.json` are:

- `tcdmx/gpt-5.5`: OpenAI chat-completions compatible
- `aitoken/gpt-5.5`: OpenAI chat-completions compatible
- `zzshu-claude/claude-opus-4-6`: Anthropic Messages compatible
- `zzshu-gpt/gpt-5.5`: OpenAI chat-completions compatible

If the upstream model names differ, edit the `id` fields and matching model refs under `agents.defaults.model`.

## Telegram

Telegram is enabled with:

- `dmPolicy: "allowlist"`
- `allowFrom: ["${TELEGRAM_ALLOWED_USER_ID}"]`
- `groupAllowFrom: ["${TELEGRAM_ALLOWED_USER_ID}"]`

The ID must be a numeric Telegram user id. The current logs show Telegram started and received a DM from the configured bot.
