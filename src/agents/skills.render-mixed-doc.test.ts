import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./skills/frontmatter.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CASES = [
  {
    file: "skills/render-mixed-doc-png/SKILL.md",
    name: "render-mixed-doc-png",
    description: "Render mixed LaTeX, Markdown text, and charts into a PNG.",
    bodyNeedles: ["PNG", "Markdown", "charts", "equations", "MEDIA:"],
  },
  {
    file: "skills/render-mixed-doc-pdf/SKILL.md",
    name: "render-mixed-doc-pdf",
    description: "Render mixed LaTeX, Markdown text, and charts into a PDF.",
    bodyNeedles: ["PDF", "Markdown", "charts", "equations", "MEDIA:"],
  },
] as const;

describe("render mixed doc skills", () => {
  it.each(CASES)("keeps $file parseable", async ({ file, name, description, bodyNeedles }) => {
    const raw = await fs.readFile(path.join(repoRoot, file), "utf8");
    const frontmatter = parseFrontmatter(raw);

    expect(frontmatter.name, file).toBe(name);
    expect(frontmatter.description, file).toBe(description);
    for (const needle of bodyNeedles) {
      expect(raw, file).toContain(needle);
    }
  });
});
