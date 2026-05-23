---
name: network-search
description: "Search the web, verify current facts, compare sources, and fetch URLs when up-to-date internet evidence is needed."
metadata: { "openclaw": { "emoji": "🔎" } }
---

# Network Search

Use this when the user asks to search, browse, verify, look up current information, or answer something likely to have changed.

Workflow:

1. Search SearXNG first using `SEARXNG_BASE_URL` with JSON output.
2. If SearXNG is unavailable or too sparse, use the configured DuckDuckGo MCP server named by `DUCKDUCKGO_MCP_SERVER`.
3. If both fail and higher precision is needed, use Google Custom Search with `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID`.
4. Prefer primary sources: official docs, standards, repositories, filings, or the original publication.
5. Cross-check news, prices, policy, package versions, and company/person facts with at least two credible sources when feasible.
6. Include source links in the answer and distinguish source facts from inference.
7. Do not expose API keys or auth headers.

Search configuration:

- `SEARXNG_BASE_URL`: self-hosted SearXNG base URL, for example `http://searxng:8080`.
- `DUCKDUCKGO_MCP_SERVER`: configured MCP server name for DuckDuckGo search; no API key expected.
- `GOOGLE_SEARCH_API_KEY`: Google Custom Search JSON API key.
- `GOOGLE_SEARCH_ENGINE_ID`: Google Programmable Search Engine ID.
- `APIFY_API_TOKEN`: last-resort fallback for supported video/transcript extraction workflows.

If no network tool or search provider is available, say that search is unavailable and answer only from provided/local context.
