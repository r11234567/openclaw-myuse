import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { splitTelegramRichMessageTextChunks } from "./rich-message.js";
import { telegramifyMarkdownToRichHtmlChunks } from "./telegramify-markdown.js";

const originalEnabled = process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN;
const pythonExecutable = process.env.OPENCLAW_TELEGRAMIFY_PYTHON?.trim() || "python3";
const telegramifyAvailable =
  spawnSync(pythonExecutable, ["-c", "import telegramify_markdown"], {
    stdio: "ignore",
  }).status === 0;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN;
  } else {
    process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN = originalEnabled;
  }
});

describe.skipIf(!telegramifyAvailable)("telegramify-markdown rich conversion", () => {
  it("converts standard Markdown and LaTeX to Telegram Rich HTML", () => {
    process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN = "1";
    const chunks = telegramifyMarkdownToRichHtmlChunks(
      [String.raw`**bold** and $x^2$`, "", String.raw`\[\frac{1}{2}\]`].join("\n"),
    );

    const html = chunks?.join("") ?? "";
    expect(chunks).not.toBeNull();
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<tg-math>x^2</tg-math>");
    expect(html).toContain(String.raw`<tg-math-block>\frac{1}{2}</tg-math-block>`);
  });

  it("feeds telegramify output into OpenClaw's normalized rich chunks", () => {
    process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN = "1";
    const chunks = splitTelegramRichMessageTextChunks({
      text: "| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$$E = mc^2$$",
      textLimit: 32_768,
      textMode: "markdown",
      chunkMode: "length",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("<table");
    expect(chunks[0]?.text).toContain("<tg-math-block>E = mc^2</tg-math-block>");
  });

  it("does not reinterpret LaTeX delimiters inside code", () => {
    process.env.OPENCLAW_TELEGRAMIFY_MARKDOWN = "1";
    const chunks = telegramifyMarkdownToRichHtmlChunks(
      ["`\\(literal\\)`", "", "```text", "\\[also literal\\]", "```"].join("\n"),
    );

    const html = chunks?.join("") ?? "";
    expect(chunks).not.toBeNull();
    expect(html).not.toContain("<tg-math");
    expect(html).toContain("\\(literal\\)");
    expect(html).toContain("\\[also literal\\]");
  });
});
