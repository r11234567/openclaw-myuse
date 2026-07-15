import { spawnSync } from "node:child_process";
import { findCodeRegions, isInsideCode } from "openclaw/plugin-sdk/text-chunking";

const TELEGRAMIFY_MARKDOWN_ENV = "OPENCLAW_TELEGRAMIFY_MARKDOWN";
const TELEGRAMIFY_PYTHON_ENV = "OPENCLAW_TELEGRAMIFY_PYTHON";
const TELEGRAMIFY_TIMEOUT_MS = 10_000;
const TELEGRAMIFY_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const TELEGRAMIFY_CACHE_LIMIT = 64;
const LEGACY_TELEGRAM_MATH_RE =
  /<tg-math-block>([\s\S]*?)<\/tg-math-block>|<tg-math>([\s\S]*?)<\/tg-math>/giu;
const BRACKET_MATH_RE = /(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]|(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/gu;
const DISPLAY_DOLLAR_MATH_RE = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/gu;
const TELEGRAMIFY_SCRIPT = [
  "import json, sys",
  "from telegramify_markdown import telegramify_rich",
  "messages = telegramify_rich(sys.stdin.read(), mode='html', latex_escape=False)",
  "sys.stdout.write(json.dumps([message.to_dict() for message in messages], ensure_ascii=False))",
].join("\n");

const conversionCache = new Map<string, readonly string[]>();
let warnedUnavailable = false;

function replaceOutsideMarkdownCode(
  markdown: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string,
): string {
  const codeRegions = findCodeRegions(markdown);
  let output = "";
  let cursor = 0;
  for (const match of markdown.matchAll(pattern)) {
    const start = match.index ?? 0;
    const matched = match[0];
    output += markdown.slice(cursor, start);
    output += isInsideCode(start, codeRegions) ? matched : replacer(match);
    cursor = start + matched.length;
  }
  return output + markdown.slice(cursor);
}

function normalizeTelegramifyMathDelimiters(markdown: string): string {
  const withoutLegacyTags = replaceOutsideMarkdownCode(markdown, LEGACY_TELEGRAM_MATH_RE, (match) =>
    match[1] !== undefined ? `$$${match[1]}$$` : `$${match[2] ?? ""}$`,
  );
  const withDollarDelimiters = replaceOutsideMarkdownCode(
    withoutLegacyTags,
    BRACKET_MATH_RE,
    (match) => (match[1] !== undefined ? `$$${match[1]}$$` : `$${match[2] ?? ""}$`),
  );
  return replaceOutsideMarkdownCode(
    withDollarDelimiters,
    DISPLAY_DOLLAR_MATH_RE,
    (match) =>
      // A standalone "=" inside a multiline $$ block is parsed as a Setext
      // heading before telegramify-markdown recognizes math. Physical newlines
      // are insignificant TeX whitespace; row separators such as \\ remain intact.
      `$$${(match[1] ?? "")
        .replace(/\r\n?/gu, "\n")
        .replace(/[ \t]*\n+[ \t]*/gu, " ")
        .trim()}$$`,
  );
}

function cacheConversion(markdown: string, chunks: readonly string[]): void {
  conversionCache.set(markdown, chunks);
  if (conversionCache.size <= TELEGRAMIFY_CACHE_LIMIT) {
    return;
  }
  const oldest = conversionCache.keys().next().value;
  if (oldest !== undefined) {
    conversionCache.delete(oldest);
  }
}

function warnUnavailable(message: string): void {
  if (warnedUnavailable) {
    return;
  }
  warnedUnavailable = true;
  console.warn(
    `[telegram] telegramify-markdown unavailable; using built-in rich renderer: ${message}`,
  );
}

export function telegramifyMarkdownToRichHtmlChunks(markdown: string): readonly string[] | null {
  if (process.env[TELEGRAMIFY_MARKDOWN_ENV] !== "1") {
    return null;
  }
  const cached = conversionCache.get(markdown);
  if (cached) {
    conversionCache.delete(markdown);
    conversionCache.set(markdown, cached);
    return cached;
  }

  const pythonExecutable = process.env[TELEGRAMIFY_PYTHON_ENV]?.trim() || "python3";
  const result = spawnSync(pythonExecutable, ["-c", TELEGRAMIFY_SCRIPT], {
    input: normalizeTelegramifyMathDelimiters(markdown),
    encoding: "utf8",
    timeout: TELEGRAMIFY_TIMEOUT_MS,
    maxBuffer: TELEGRAMIFY_MAX_OUTPUT_BYTES,
    windowsHide: true,
  });
  if (result.error) {
    warnUnavailable(result.error.message);
    return null;
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    warnUnavailable(stderr || `python exited with status ${String(result.status)}`);
    return null;
  }

  try {
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const payload = JSON.parse(stdout) as unknown;
    if (!Array.isArray(payload)) {
      throw new TypeError("converter output is not an array");
    }
    const chunks = payload.map((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as { html?: unknown }).html !== "string"
      ) {
        throw new TypeError("converter chunk does not contain HTML");
      }
      return (item as { html: string }).html;
    });
    cacheConversion(markdown, chunks);
    return chunks;
  } catch (error) {
    warnUnavailable(error instanceof Error ? error.message : String(error));
    return null;
  }
}
