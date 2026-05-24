---
name: render-mixed-doc-png
description: Render mixed LaTeX, Markdown text, and charts into a PNG.
metadata: { "openclaw": { "emoji": "🖼️" } }
---

# Render Mixed Doc to PNG

Use this skill when the user wants one PNG that combines prose, headings, lists, code, equations, and charts.

Workflow

1. Keep one source document for the whole output. Prefer a single HTML/CSS page or equivalent layout source.
2. Render math in the same document that will be exported. Do not leave formulas as plain text.
3. Build charts from structured data or vector output when possible. Avoid screenshotting chart fragments early.
4. Export one PNG at the requested size.
5. Check wrapping, clipped axes, broken math baselines, and overlap before delivering.
6. Return the finished file path as `MEDIA:<path-to-png>`.

Rules

- Preserve Markdown semantics for headings, lists, links, and code blocks.
- Prefer white or neutral backgrounds unless the user asks otherwise.
- Keep the layout readable rather than forcing everything into a narrow canvas.
- Verify fonts before export when the content includes CJK text.
