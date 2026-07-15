import { spawnSync } from "node:child_process";

const TELEGRAMIFY_MARKDOWN_ENV = "OPENCLAW_TELEGRAMIFY_MARKDOWN";
const TELEGRAMIFY_TIMEOUT_MS = 10_000;
const TELEGRAMIFY_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const TELEGRAMIFY_CACHE_LIMIT = 64;
const MARKDOWN_CODE_REGION_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;
const DISPLAY_BRACKET_MATH_RE = /(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g;
const INLINE_BRACKET_MATH_RE = /(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g;
const TELEGRAMIFY_SCRIPT = [
  "import json, sys",
  "from telegramify_markdown import telegramify_rich",
  "messages = telegramify_rich(sys.stdin.read(), mode='html', latex_escape=False)",
  "sys.stdout.write(json.dumps([message.to_dict() for message in messages], ensure_ascii=False))",
].join("\n");

const conversionCache = new Map<string, readonly string[]>();
let warnedUnavailable = false;

function normalizeTelegramifyMathDelimiters(markdown: string): string {
  return markdown
    .split(MARKDOWN_CODE_REGION_RE)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      return part
        .replace(DISPLAY_BRACKET_MATH_RE, (_match, math: string) => `$$${math}$$`)
        .replace(INLINE_BRACKET_MATH_RE, (_match, math: string) => `$${math}$`);
    })
    .join("");
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

export function telegramifyMarkdownToRichHtmlChunks(
  markdown: string,
): readonly string[] | null {
  if (process.env[TELEGRAMIFY_MARKDOWN_ENV] !== "1") {
    return null;
  }
  const cached = conversionCache.get(markdown);
  if (cached) {
    conversionCache.delete(markdown);
    conversionCache.set(markdown, cached);
    return cached;
  }

  const result = spawnSync("python3", ["-c", TELEGRAMIFY_SCRIPT], {
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
