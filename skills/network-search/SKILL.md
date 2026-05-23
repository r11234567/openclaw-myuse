---
name: network-search
description: "Search the web, verify current facts, compare sources, and fetch URLs when up-to-date internet evidence is needed."
metadata: { "openclaw": { "emoji": "🔎" } }
---

# Network Search

Use this when the user asks to search, browse, verify, look up current information, or answer something likely to have changed.

Workflow:

1. Search first when facts are current, niche, or source-sensitive.
2. Prefer primary sources: official docs, standards, repositories, filings, or the original publication.
3. Cross-check news, prices, policy, package versions, and company/person facts with at least two credible sources when feasible.
4. Include source links in the answer and distinguish source facts from inference.
5. Do not expose API keys or auth headers.

Provider keys that may enable hosted search/fetch tools:

- `BRAVE_API_KEY`
- `PERPLEXITY_API_KEY`
- `FIRECRAWL_API_KEY`

If no network tool or search provider is available, say that search is unavailable and answer only from provided/local context.
