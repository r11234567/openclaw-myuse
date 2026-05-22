import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { saveMediaBuffer } from "../../media/store.js";
import { logVerbose } from "../../globals.js";
import type { ReplyPayload } from "../types.js";

const LATEX_COMMAND_NAMES = [
  "frac",
  "sqrt",
  "cdot",
  "times",
  "approx",
  "pi",
  "sigma",
  "omega",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "lambda",
  "mu",
  "nu",
  "xi",
  "rho",
  "tau",
  "phi",
  "chi",
  "psi",
  "Omega",
  "Sigma",
  "Pi",
  "Theta",
  "le",
  "ge",
  "neq",
  "pm",
  "mp",
  "infty",
  "sum",
  "int",
  "lim",
  "log",
  "ln",
  "sin",
  "cos",
  "tan",
  "exp",
];

const LATEX_RE = new RegExp(
  String.raw`\\(?:${LATEX_COMMAND_NAMES.join("|")})(?:\b|(?=[^A-Za-z]))|\$\$?[^$\n]+\$\$?|\\\(|\\\)|\\\[|\\\]`,
);
const FONT_FAMILY =
  "'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans Math', 'DejaVu Sans', Arial, sans-serif";
const MONO_FONT_FAMILY =
  "'Noto Sans Mono CJK SC', 'Noto Sans Mono CJK', 'WenQuanYi Micro Hei Mono', 'DejaVu Sans Mono', monospace";
const IMAGE_MAX_WIDTH = 1120;
const IMAGE_PADDING = 40;
const BODY_FONT_SIZE = 24;
const SMALL_FONT_SIZE = 21;
const CODE_FONT_SIZE = 20;
const BACKGROUND = "#ffffff";
const FOREGROUND = "#111827";
const BORDER = "#d1d5db";
const CODE_BG = "#f3f4f6";
const CJK_FONT_PROBE_QUERY = "Noto Sans CJK SC";
const CJK_FONT_RE =
  /Noto Sans CJK|Noto Sans SC|Source Han Sans|WenQuanYi|Microsoft YaHei|PingFang|SimHei/i;

const execFileAsync = promisify(execFile);
let cjkFontProbeLogged = false;

export function resetLatexReplyImageFontProbeForTest(): void {
  cjkFontProbeLogged = false;
}

type SvgNode = {
  body: string;
  width: number;
  height: number;
  baseline: number;
};

type RenderLine = {
  body: string;
  height: number;
};

type InlineMathSegment = {
  text: string;
  math: boolean;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hasCjk(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

async function logMissingCjkFontOnce(text?: string): Promise<void> {
  if (!text || !hasCjk(text) || cjkFontProbeLogged) {
    return;
  }
  cjkFontProbeLogged = true;
  try {
    const result = await execFileAsync(
      "fc-match",
      ["-f", "%{family}\n", CJK_FONT_PROBE_QUERY],
      { timeout: 1000 },
    );
    const resolvedFamily = String(result.stdout ?? "").trim();
    if (!CJK_FONT_RE.test(resolvedFamily)) {
      logVerbose(
        `LaTeX reply image CJK font probe resolved "${resolvedFamily || "unknown"}"; Chinese glyphs may render as boxes. Rebuild the runtime image with fonts-noto-cjk/fontconfig installed.`,
      );
    }
  } catch (err) {
    logVerbose(
      `LaTeX reply image CJK font probe failed; Chinese glyphs may render as boxes until fontconfig and fonts-noto-cjk are installed: ${String(err)}`,
    );
  }
}

function estimateTextWidth(value: string, fontSize: number): number {
  let width = 0;
  for (const char of value) {
    if (char === "\t") {
      width += fontSize * 1.4;
    } else if (char === " ") {
      width += fontSize * 0.32;
    } else if (hasCjk(char)) {
      width += fontSize;
    } else if (/[A-Z0-9]/.test(char)) {
      width += fontSize * 0.62;
    } else if (/[il.,:;|]/.test(char)) {
      width += fontSize * 0.28;
    } else {
      width += fontSize * 0.54;
    }
  }
  return Math.max(1, width);
}

function textNode(
  value: string,
  fontSize: number,
  options?: { mono?: boolean; color?: string },
): SvgNode {
  const width = estimateTextWidth(value, fontSize);
  const height = fontSize * 1.35;
  const baseline = fontSize;
  return {
    width,
    height,
    baseline,
    body:
      `<text x="0" y="${baseline}" font-family="${options?.mono ? MONO_FONT_FAMILY : FONT_FAMILY}" ` +
      `font-size="${fontSize}" fill="${options?.color ?? FOREGROUND}">${escapeXml(value)}</text>`,
  };
}

function translateNode(node: SvgNode, x: number, y: number): string {
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})">${node.body}</g>`;
}

function hstack(nodes: SvgNode[], gap = 0): SvgNode {
  if (nodes.length === 0) {
    return textNode("", BODY_FONT_SIZE);
  }
  const baseline = Math.max(...nodes.map((node) => node.baseline));
  const descent = Math.max(...nodes.map((node) => node.height - node.baseline));
  let x = 0;
  const body: string[] = [];
  for (const node of nodes) {
    body.push(translateNode(node, x, baseline - node.baseline));
    x += node.width + gap;
  }
  return {
    width: Math.max(1, x - gap),
    height: baseline + descent,
    baseline,
    body: body.join(""),
  };
}

function fractionNode(numerator: SvgNode, denominator: SvgNode): SvgNode {
  const gap = 7;
  const width = Math.max(numerator.width, denominator.width) + 18;
  const numeratorX = (width - numerator.width) / 2;
  const denominatorX = (width - denominator.width) / 2;
  const lineY = numerator.height + gap;
  const denominatorY = lineY + gap;
  return {
    width,
    height: denominatorY + denominator.height,
    baseline: lineY + denominator.baseline * 0.45,
    body:
      translateNode(numerator, numeratorX, 0) +
      `<line x1="0" y1="${lineY}" x2="${width}" y2="${lineY}" stroke="${FOREGROUND}" stroke-width="2"/>` +
      translateNode(denominator, denominatorX, denominatorY),
  };
}

function sqrtNode(inner: SvgNode): SvgNode {
  const symbol = textNode("√", BODY_FONT_SIZE + 3);
  const innerX = symbol.width + 3;
  const topY = 3;
  const body =
    translateNode(symbol, 0, Math.max(0, inner.baseline - symbol.baseline + 2)) +
    `<line x1="${innerX}" y1="${topY}" x2="${innerX + inner.width + 5}" y2="${topY}" stroke="${FOREGROUND}" stroke-width="2"/>` +
    translateNode(inner, innerX + 3, 8);
  return {
    width: innerX + inner.width + 8,
    height: inner.height + 10,
    baseline: inner.baseline + 8,
    body,
  };
}

function scriptNode(base: SvgNode, script: SvgNode, kind: "sub" | "sup"): SvgNode {
  const y = kind === "sup" ? Math.max(0, base.baseline - script.height - 4) : base.baseline + 3;
  const height = Math.max(base.height, y + script.height);
  return {
    width: base.width + script.width,
    height,
    baseline: base.baseline,
    body: translateNode(base, 0, 0) + translateNode(script, base.width, y),
  };
}

const COMMAND_TEXT: Record<string, string> = {
  cdot: "·",
  times: "×",
  approx: "≈",
  pi: "π",
  sigma: "σ",
  omega: "ω",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  rho: "ρ",
  tau: "τ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  Omega: "Ω",
  Sigma: "Σ",
  Pi: "Π",
  Theta: "Θ",
  le: "≤",
  ge: "≥",
  neq: "≠",
  pm: "±",
  mp: "∓",
  infty: "∞",
  sum: "∑",
  int: "∫",
};

class LatexParser {
  private index = 0;

  constructor(
    private readonly input: string,
    private readonly fontSize: number,
  ) {}

  parse(): SvgNode {
    return this.parseUntil();
  }

  private parseUntil(stop?: string): SvgNode {
    const nodes: SvgNode[] = [];
    while (this.index < this.input.length) {
      if (stop && this.input[this.index] === stop) {
        this.index += 1;
        break;
      }
      if (this.input[this.index] === "^" || this.input[this.index] === "_") {
        const kind = this.input[this.index] === "^" ? "sup" : "sub";
        this.index += 1;
        const script = this.parseAtom(Math.max(12, this.fontSize * 0.68));
        const base = nodes.pop() ?? textNode("", this.fontSize);
        nodes.push(scriptNode(base, script, kind));
        continue;
      }
      nodes.push(this.parseAtom(this.fontSize));
    }
    return hstack(nodes);
  }

  private parseGroup(fontSize: number): SvgNode {
    if (this.input[this.index] !== "{") {
      return this.parseAtom(fontSize);
    }
    this.index += 1;
    return new LatexParser(this.consumeGroupContent(), fontSize).parse();
  }

  private consumeGroupContent(): string {
    let depth = 1;
    const start = this.index;
    while (this.index < this.input.length) {
      const char = this.input[this.index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const content = this.input.slice(start, this.index);
          this.index += 1;
          return content;
        }
      }
      this.index += 1;
    }
    return this.input.slice(start);
  }

  private parseCommand(fontSize: number): SvgNode {
    this.index += 1;
    const match = /^[A-Za-z]+/.exec(this.input.slice(this.index));
    const command = match?.[0] ?? "";
    this.index += command.length;
    if (command === "frac") {
      return fractionNode(this.parseGroup(fontSize * 0.82), this.parseGroup(fontSize * 0.82));
    }
    if (command === "sqrt") {
      return sqrtNode(this.parseGroup(fontSize * 0.9));
    }
    const text = COMMAND_TEXT[command] ?? command;
    return textNode(text, fontSize);
  }

  private parseAtom(fontSize: number): SvgNode {
    const char = this.input[this.index];
    if (char === "\\") {
      return this.parseCommand(fontSize);
    }
    if (char === "{") {
      this.index += 1;
      return this.parseUntil("}");
    }
    this.index += 1;
    return textNode(char ?? "", fontSize);
  }
}

function stripMathDelimiters(value: string): string {
  return value
    .replace(/^\s*\$\$([\s\S]+)\$\$\s*$/u, "$1")
    .replace(/^\s*\$([\s\S]+)\$\s*$/u, "$1")
    .replace(/\\\(([\s\S]+)\\\)/gu, "$1")
    .replace(/\\\[([\s\S]+)\\\]/gu, "$1");
}

function renderLatex(value: string, fontSize = BODY_FONT_SIZE): SvgNode {
  return new LatexParser(stripMathDelimiters(value), fontSize).parse();
}

export function replyTextContainsLatex(text?: string): boolean {
  return typeof text === "string" && LATEX_RE.test(text);
}

function normalizeMarkdownText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, "$1 ($2)");
}

function splitWordsForWrap(value: string): string[] {
  const tokens = value.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s]+|\s+/gu,
  );
  return tokens ?? [value];
}

function wrapPlainText(value: string, maxWidth: number, fontSize: number): string[] {
  const tokens = splitWordsForWrap(value);
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current + token;
    if (current && estimateTextWidth(candidate.trimEnd(), fontSize) > maxWidth) {
      lines.push(current.trimEnd());
      current = token.trimStart();
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : [""];
}

function renderPlainLine(
  text: string,
  y: number,
  maxWidth: number,
  fontSize = BODY_FONT_SIZE,
): RenderLine[] {
  return wrapPlainText(normalizeMarkdownText(text), maxWidth, fontSize).map((line) => ({
    height: fontSize * 1.45,
    body: `<text x="${IMAGE_PADDING}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${FOREGROUND}">${escapeXml(line)}</text>`,
  }));
}

function renderCodeLine(text: string, y: number, maxWidth: number): RenderLine[] {
  return wrapPlainText(text, maxWidth, CODE_FONT_SIZE).map((line) => ({
    height: CODE_FONT_SIZE * 1.45,
    body: `<text x="${IMAGE_PADDING + 14}" y="${y}" font-family="${MONO_FONT_FAMILY}" font-size="${CODE_FONT_SIZE}" fill="${FOREGROUND}">${escapeXml(line)}</text>`,
  }));
}

function splitInlineMathSegments(line: string): InlineMathSegment[] {
  const pattern = /\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+\$/gu;
  const segments: InlineMathSegment[] = [];
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ text: normalizeMarkdownText(line.slice(cursor, index)), math: false });
    }
    segments.push({ text: match[0], math: true });
    cursor = index + match[0].length;
  }
  if (cursor < line.length) {
    segments.push({ text: normalizeMarkdownText(line.slice(cursor)), math: false });
  }
  return segments.length > 0 ? segments : [{ text: line, math: true }];
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(
    lines[index]?.includes("|") && lines[index + 1] && isTableSeparator(lines[index + 1]),
  );
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => normalizeMarkdownText(cell.trim()));
}

function renderTable(
  lines: string[],
  start: number,
  y: number,
  contentWidth: number,
): { next: number; rendered: RenderLine[] } {
  const headers = parseTableRow(lines[start]);
  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    rows.push(parseTableRow(lines[index]));
    index += 1;
  }
  const colCount = Math.max(headers.length, ...rows.map((row) => row.length));
  const colWidth = contentWidth / Math.max(1, colCount);
  const rowHeight = 38;
  const tableX = IMAGE_PADDING;
  const rendered: RenderLine[] = [];
  const allRows = [headers, ...rows];
  allRows.forEach((row, rowIndex) => {
    const rowY = y + rowIndex * rowHeight;
    const cells = Array.from({ length: colCount }, (_unused, colIndex) => row[colIndex] ?? "");
    rendered.push({
      height: rowHeight,
      body:
        `<rect x="${tableX}" y="${rowY - 25}" width="${contentWidth}" height="${rowHeight}" fill="${rowIndex === 0 ? CODE_BG : BACKGROUND}" stroke="${BORDER}" stroke-width="1"/>` +
        cells
          .map((cell, colIndex) => {
            const x = tableX + colIndex * colWidth;
            return (
              `<line x1="${x}" y1="${rowY - 25}" x2="${x}" y2="${rowY + rowHeight - 25}" stroke="${BORDER}" stroke-width="1"/>` +
              `<text x="${x + 10}" y="${rowY}" font-family="${FONT_FAMILY}" font-size="${SMALL_FONT_SIZE}" fill="${FOREGROUND}">${escapeXml(cell.slice(0, 80))}</text>`
            );
          })
          .join("") +
        `<line x1="${tableX + contentWidth}" y1="${rowY - 25}" x2="${tableX + contentWidth}" y2="${rowY + rowHeight - 25}" stroke="${BORDER}" stroke-width="1"/>`,
    });
  });
  return { next: index, rendered };
}

function renderLatexLine(line: string, y: number, contentWidth: number): RenderLine[] {
  const segments = splitInlineMathSegments(line);
  const node = hstack(
    segments.map((segment) =>
      segment.math
        ? renderLatex(segment.text, BODY_FONT_SIZE)
        : textNode(segment.text, BODY_FONT_SIZE),
    ),
  );
  if (node.width <= contentWidth) {
    return [
      {
        height: node.height + 16,
        body: translateNode(node, IMAGE_PADDING, y - node.baseline + 2),
      },
    ];
  }
  return renderCodeLine(line, y, contentWidth);
}

function renderReplySvg(text: string): string {
  const contentWidth = IMAGE_MAX_WIDTH - IMAGE_PADDING * 2;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rendered: string[] = [];
  let y = IMAGE_PADDING + BODY_FONT_SIZE;
  let inCode = false;
  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      index += 1;
      continue;
    }
    if (!line.trim()) {
      y += 18;
      index += 1;
      continue;
    }
    if (!inCode && isTableStart(lines, index)) {
      const table = renderTable(lines, index, y, contentWidth);
      for (const item of table.rendered) {
        rendered.push(item.body);
      }
      y += table.rendered.length * 38 + 18;
      index = table.next;
      continue;
    }
    const items = inCode
      ? renderCodeLine(line, y, contentWidth)
      : replyTextContainsLatex(line)
        ? renderLatexLine(line, y, contentWidth)
        : renderPlainLine(line, y, contentWidth);
    for (const item of items) {
      rendered.push(item.body);
      y += item.height;
    }
    index += 1;
  }
  const height = Math.ceil(y + IMAGE_PADDING);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_MAX_WIDTH}" height="${height}" viewBox="0 0 ${IMAGE_MAX_WIDTH} ${height}">` +
    `<rect width="100%" height="100%" fill="${BACKGROUND}"/>` +
    rendered.join("") +
    `</svg>`
  );
}

export async function renderLatexReplyPayloadToImageIfNeeded(
  payload: ReplyPayload,
): Promise<ReplyPayload> {
  const text = payload.text;
  if (!replyTextContainsLatex(text) || payload.mediaUrl || payload.mediaUrls?.length) {
    return payload;
  }

  const sharp = (await import("sharp")).default;
  await logMissingCjkFontOnce(text);
  const svg = renderReplySvg(text ?? "");
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  const saved = await saveMediaBuffer(
    png,
    "image/png",
    "outbound",
    10 * 1024 * 1024,
    "openclaw-latex-reply.png",
  );
  return {
    ...payload,
    text: undefined,
    spokenText: payload.spokenText ?? text,
    mediaUrl: saved.path,
    mediaUrls: [saved.path],
    trustedLocalMedia: true,
    sensitiveMedia: true,
  };
}
