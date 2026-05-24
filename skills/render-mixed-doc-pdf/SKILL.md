---
name: render-mixed-doc-pdf
description: Render mixed LaTeX, Markdown text, and charts into a PDF.
metadata: { "openclaw": { "emoji": "📄" } }
---

# Render Mixed Doc to PDF

Use this skill when the user wants a printable PDF that combines prose, equations, and charts.

Workflow

1. Reuse one source document for the whole page or deck.
2. Render math and charts in the same layout pass.
3. Choose page size and margins to fit the content; use multiple pages only when needed.
4. Export a PDF directly from the composed document.
5. Check page breaks, margin clipping, and vector text sharpness before delivering.
6. Return the finished file path as `MEDIA:<path-to-pdf>`.

Rules

- Keep headings, lists, code, and links in Markdown form until the final export.
- Prefer vector charts and embedded fonts.
- Do not rasterize early unless the source tool requires it.
- Verify fonts before export when the content includes CJK text.
