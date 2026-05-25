---
name: render-mixed-doc-pdf
description: Render mixed LaTeX, Markdown text, and charts into a PDF.
metadata: { "openclaw": { "emoji": "📄" } }
---

# Render Mixed Doc to PDF

Use this skill when the user wants a printable PDF that combines prose, equations, and charts.

Workflow

1. Reuse one source Markdown document for the whole page or deck.
2. Render math, prose, tables, links, code, and chart images in the same Pandoc/XeLaTeX layout pass.
3. Write the source under `out/` with an ASCII filename, then run:
   `skills/render-mixed-doc-pdf/scripts/render_mixed_doc_pdf.sh <input.md> <output.pdf>`
4. Choose page size and margins to fit the content; use multiple pages only when needed.
5. Check page breaks, margin clipping, CJK font coverage, and vector text sharpness before delivering.
6. Keep the PDF compact. If it is over 10 MB, simplify embedded images or split the document.
7. Return the finished file path as `MEDIA:./out/<ascii-name>.pdf`.

Rules

- Keep headings, lists, code, and links in Markdown form until the final export.
- Prefer vector charts and embedded fonts.
- Do not rasterize early unless the source tool requires it.
- Verify fonts before export when the content includes CJK text.
- Do not write intermediate media to `/tmp` for tool calls. Use `out/` inside the workspace.
- Prefer ASCII output filenames for channel delivery; put the human-readable title in the document body.
