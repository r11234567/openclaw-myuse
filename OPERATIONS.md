# OpenClaw Docker Operations

This deployment keeps durable state in `$HOME/.openclaw` and runs the gateway from `$HOME/openclaw`.

## Fill secrets

Edit `$HOME/openclaw/.env` and set at least one provider key:

- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `LITELLM_API_KEY`

For Telegram, create a bot with `@BotFather`, then set `TELEGRAM_BOT_TOKEN`.

## Build and run

```bash
cd $HOME/openclaw
docker compose build
docker compose up -d openclaw-gateway
```

The gateway is bound to loopback on `127.0.0.1:18789`. This is the safer VPS/default posture. Use SSH tunneling or a reverse proxy with authentication if exposing it.

## CLI

```bash
cd $HOME/openclaw
docker compose run --rm openclaw-cli --help
docker compose run --rm openclaw-cli models list
docker compose run --rm openclaw-cli doctor
```

Telegram pairing:

```bash
docker compose run --rm openclaw-cli pairing list telegram
docker compose run --rm openclaw-cli pairing approve telegram <CODE>
```

## Provider routing

The default model is `openrouter/auto`, with fallback to OpenAI, Anthropic, Gemini, then LiteLLM. Change this in `$HOME/.openclaw/openclaw.json` under `agents.defaults.model`.

LiteLLM is preconfigured as a custom provider through `LITELLM_BASE_URL`. For a host-side LiteLLM proxy, keep `http://host.docker.internal:4000`.

## Frontend and OpenWebUI

OpenClaw's Control UI is available on the gateway at `http://127.0.0.1:18789/` after the container starts.

For external frontends, keep using the gateway token from `.env`. If a frontend requires an OpenAI-compatible HTTP API, first verify the current OpenClaw endpoint support with:

```bash
docker compose run --rm openclaw-cli --help
```

and check `$HOME/openclaw/docs/gateway/openai-http-api.md`.

## MCP and extensions

MCP placeholders live in `$HOME/.openclaw/openclaw.json` under `mcp.servers`. Add stdio or remote MCP servers there.

Bundled plugins are allowlisted under `plugins.allow`. Add provider, channel, or tool plugins there and restart the gateway. External skills can be placed under `$HOME/.openclaw/skills`.

If a skill or MCP server needs extra OS binaries, add them at image build time with Docker build args or by editing the Dockerfile, then rebuild. Do not install tools manually inside a running container because the container filesystem is ephemeral.
