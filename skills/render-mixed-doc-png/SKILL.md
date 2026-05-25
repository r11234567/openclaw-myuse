---
name: render-mixed-doc-png
description: Render mixed LaTeX, Markdown text, and charts into a PNG.
metadata: { "openclaw": { "emoji": "🖼️" } }
---

# Render Mixed Doc to PNG

Use this skill when the user wants one PNG that combines prose, headings, lists, code, equations, and charts.

Workflow

1. Keep one source Markdown document for the whole output.
2. Render math, prose, tables, links, code, and chart images through the same Pandoc/XeLaTeX layout pass.
3. Write the source under `out/` with an ASCII filename, then run:
   `skills/render-mixed-doc-png/scripts/render_mixed_doc_png.sh <input.md> <output.png>`
4. The script renders PDF first, rasterizes pages with `pdftoppm`, and appends multi-page output into one PNG.
5. Check wrapping, clipped axes, broken math baselines, overlap, and final PNG dimensions before delivering.
6. Return the finished file path as `MEDIA:./out/<ascii-name>.png`.

Rules

- Preserve Markdown semantics for headings, lists, links, and code blocks.
- Prefer white or neutral backgrounds unless the user asks otherwise.
- Keep the layout readable rather than forcing everything into a narrow canvas.
- Verify fonts before export when the content includes CJK text.
- Do not write intermediate media to `/tmp` for tool calls. Use `out/` inside the workspace.
- Use vision models only for OCR/page reading. Do not use them as the rendering path.
- Prefer ASCII output filenames for channel delivery; put the human-readable title in the image body.
