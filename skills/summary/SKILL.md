---
name: summary
description: "Summarize URLs, videos, PDFs, transcripts, articles, or local files; alias for the summarize CLI workflow."
homepage: https://summarize.sh
metadata:
  {
    "openclaw":
      {
        "emoji": "🧾",
        "requires": { "bins": ["summarize"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "steipete/tap/summarize",
              "bins": ["summarize"],
              "label": "Install summarize (brew)",
            },
          ],
      },
  }
---

# Summary

Use this as the short-name alias for the existing `summarize` skill.

Prefer the `summarize` CLI when available:

```bash
summarize "https://example.com"
summarize "/path/to/file.pdf"
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto
```

Keys used by the CLI depend on provider:

- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- xAI: `XAI_API_KEY`
- Google: `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, or `GOOGLE_API_KEY`
- YouTube fallback: `APIFY_API_TOKEN`
- Extraction fallback: `FIRECRAWL_API_KEY`

If `summarize` is missing, report that the binary is unavailable instead of inventing a transcript or summary.
