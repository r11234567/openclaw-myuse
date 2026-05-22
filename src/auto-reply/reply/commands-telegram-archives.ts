import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  formatSessionArchiveTimestamp,
  parseSessionArchiveTimestamp,
} from "../../config/sessions/artifacts.js";
import { updateSessionStore } from "../../config/sessions/store.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type { CommandHandler, HandleCommandsParams } from "./commands-types.js";

const ARCHIVE_LIST_COMMANDS = new Set(["/archives", "/tg_archives"]);
const ARCHIVE_USE_COMMANDS = new Set(["/use", "/tg_use", "/archive_use", "/switch_archive"]);
const ARCHIVE_DELETE_COMMANDS = new Set(["/delete", "/tg_delete", "/archive_delete"]);
const CURRENT_COMMANDS = new Set(["/current", "/tg_current", "/current_tg"]);
const ARCHIVE_SUFFIX_RE = /\.jsonl\.reset\.(.+)$/;
const ARCHIVE_CODE_LENGTH = 5;
const PAGE_SIZE = 10;

type ParsedTelegramArchive = {
  sessionId: string;
  archivePath: string;
  archivedAtMs: number;
  firstUserText?: string;
  lastUserText?: string;
  messageCount: number;
};

type TelegramArchive = ParsedTelegramArchive & {
  code: string;
};

function parseCommand(input: string): { command: string; rest: string } {
  const trimmed = input.trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  return {
    command: (match?.[1] ?? "").toLowerCase(),
    rest: match?.[2]?.trim() ?? "",
  };
}

function isTelegramCommand(params: HandleCommandsParams): boolean {
  return (
    params.command.surface === "telegram" ||
    params.command.channel === "telegram" ||
    params.ctx.OriginatingChannel === "telegram"
  );
}

function resolveTelegramChatId(params: HandleCommandsParams): string | undefined {
  const candidates = [
    params.ctx.OriginatingTo,
    params.ctx.To,
    params.command.to,
    params.command.from,
    params.ctx.From,
    params.command.senderId,
  ];
  for (const candidate of candidates) {
    const value = normalizeOptionalString(candidate);
    if (!value) {
      continue;
    }
    const normalized = value.startsWith("telegram:") ? value : `telegram:${value}`;
    if (/^telegram:[-0-9]+$/u.test(normalized)) {
      return normalized;
    }
  }
  return undefined;
}

function resolveSessionsDir(params: HandleCommandsParams): string | undefined {
  const sessionFile = params.sessionEntry?.sessionFile;
  if (sessionFile) {
    return path.dirname(sessionFile);
  }
  return params.storePath ? path.dirname(params.storePath) : undefined;
}

function extractTextFromMessageContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .filter(Boolean);
  return parts.join("\n").trim() || undefined;
}

function summarizeUserText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const withoutMeta = text
    .replace(/Conversation info \(untrusted metadata\):[\s\S]*?\n\n/u, "")
    .replace(/Sender \(untrusted metadata\):[\s\S]*?\n\n/u, "")
    .replace(/Conversation context \(untrusted[\s\S]*?\n\n/u, "")
    .trim();
  const summary = withoutMeta || text;
  return summary.replace(/\s+/gu, " ").slice(0, 80);
}

function textHasTelegramChatMetadata(text: string | undefined, chatId: string): boolean {
  if (!text) {
    return false;
  }
  const escaped = chatId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`"chat_id"\\s*:\\s*"${escaped}"`, "u").test(text);
}

function parseArchiveTimestamp(filePath: string): number | null {
  return parseSessionArchiveTimestamp(path.basename(filePath), "reset");
}

function isResetArchiveFileName(name: string): boolean {
  return parseSessionArchiveTimestamp(name, "reset") !== null;
}

function parseArchiveTranscript(params: {
  filePath: string;
  content: string;
  chatId: string;
}): ParsedTelegramArchive | null {
  let sessionId = path.basename(params.filePath).replace(ARCHIVE_SUFFIX_RE, "");
  let firstUserText: string | undefined;
  let lastUserText: string | undefined;
  let messageCount = 0;
  let belongsToChat = false;
  for (const line of params.content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as {
        type?: string;
        id?: string;
        message?: { role?: string; content?: unknown };
      };
      if (entry.type === "session" && typeof entry.id === "string") {
        sessionId = entry.id;
      }
      if (entry.type !== "message" || entry.message?.role !== "user") {
        continue;
      }
      const text = extractTextFromMessageContent(entry.message.content);
      belongsToChat ||= textHasTelegramChatMetadata(text, params.chatId);
      const summary = summarizeUserText(text);
      if (!summary) {
        continue;
      }
      if (isArchiveCommandText(summary)) {
        continue;
      }
      firstUserText ??= summary;
      lastUserText = summary;
      messageCount += 1;
    } catch {
      // Ignore partial or malformed transcript lines.
    }
  }
  if (!belongsToChat) {
    return null;
  }
  if (messageCount === 0) {
    return null;
  }
  const archivedAtMs = parseArchiveTimestamp(params.filePath);
  if (archivedAtMs == null) {
    return null;
  }
  return {
    sessionId,
    archivePath: params.filePath,
    archivedAtMs,
    firstUserText,
    lastUserText,
    messageCount,
  };
}

function buildArchiveCode(archive: ParsedTelegramArchive): string {
  return crypto
    .createHash("sha256")
    .update(`${archive.sessionId}\n${archive.archivedAtMs}`)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/gu, "")
    .slice(0, ARCHIVE_CODE_LENGTH)
    .toLowerCase();
}

function assignArchiveCodes(archives: ParsedTelegramArchive[]): TelegramArchive[] {
  return archives.map((archive) => ({ ...archive, code: buildArchiveCode(archive) }));
}

async function listTelegramArchives(params: HandleCommandsParams): Promise<TelegramArchive[]> {
  const chatId = resolveTelegramChatId(params);
  const sessionsDir = resolveSessionsDir(params);
  if (!chatId || !sessionsDir) {
    return [];
  }
  const names = await fs.readdir(sessionsDir);
  const archives: ParsedTelegramArchive[] = [];
  for (const name of names) {
    if (!isResetArchiveFileName(name)) {
      continue;
    }
    const filePath = path.join(sessionsDir, name);
    try {
      const content = await fs.readFile(filePath, "utf8");
      const archive = parseArchiveTranscript({ filePath, content, chatId });
      if (archive) {
        archives.push(archive);
      }
    } catch {
      // Skip unreadable archive candidates.
    }
  }
  return assignArchiveCodes(archives.toSorted((a, b) => b.archivedAtMs - a.archivedAtMs));
}

function formatArchiveTime(archive: TelegramArchive): string {
  return new Date(archive.archivedAtMs).toLocaleString("zh-CN", {
    hour12: false,
    timeZoneName: "short",
  });
}

function formatArchiveLine(archive: TelegramArchive): string {
  const title = archive.lastUserText ?? archive.firstUserText ?? "(无可读用户消息)";
  return `\`${archive.code}\`  ${formatArchiveTime(archive)}\n   ${title}`;
}

function formatArchivesReply(archives: TelegramArchive[], page: number): string {
  if (archives.length === 0) {
    return "没有找到当前聊天的归档会话。";
  }
  const maxPage = Math.max(1, Math.ceil(archives.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), maxPage);
  const start = (safePage - 1) * PAGE_SIZE;
  const selected = archives.slice(start, start + PAGE_SIZE);
  return [
    `当前聊天的归档会话 (${safePage}/${maxPage})：`,
    "",
    ...selected.map((archive) => formatArchiveLine(archive)),
    "",
    "切换：/use <5位会话码>",
    "删除：/delete <5位会话码>",
    "翻页：/archives <页码>",
    "提示：Telegram 里点一下 5 位会话码即可复制。",
  ].join("\n");
}

function parsePositiveIndex(value: string): number | undefined {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseArchiveSelector(value: string): string | undefined {
  const selector = value.trim().toLowerCase();
  return /^[a-z0-9]{5}$/u.test(selector) ? selector : undefined;
}

function buildArchivePath(filePath: string, now = new Date()): string {
  const stamp = formatSessionArchiveTimestamp(now.getTime());
  return `${filePath}.reset.${stamp}`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isArchiveCommandText(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "/new" ||
    normalized.startsWith("/new ") ||
    normalized === "/reset" ||
    normalized.startsWith("/reset ") ||
    normalized === "/archives" ||
    normalized.startsWith("/archives ") ||
    normalized === "/tg_archives" ||
    normalized.startsWith("/tg_archives ") ||
    normalized === "/use" ||
    normalized.startsWith("/use ") ||
    normalized === "/tg_use" ||
    normalized.startsWith("/tg_use ") ||
    normalized === "/archive_use" ||
    normalized.startsWith("/archive_use ") ||
    normalized === "/switch_archive" ||
    normalized.startsWith("/switch_archive ") ||
    normalized === "/delete" ||
    normalized.startsWith("/delete ") ||
    normalized === "/tg_delete" ||
    normalized.startsWith("/tg_delete ") ||
    normalized === "/archive_delete" ||
    normalized.startsWith("/archive_delete ") ||
    normalized === "/current" ||
    normalized === "/tg_current" ||
    normalized === "/current_tg"
  );
}

async function transcriptHasConversationContent(sessionFile: string): Promise<boolean> {
  let content: string;
  try {
    content = await fs.readFile(sessionFile, "utf8");
  } catch {
    return false;
  }
  for (const line of content.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line) as {
        type?: string;
        message?: { role?: string; content?: unknown };
      };
      if (entry.type !== "message") {
        continue;
      }
      const role = entry.message?.role;
      if (role !== "user" && role !== "assistant") {
        continue;
      }
      const text = summarizeUserText(extractTextFromMessageContent(entry.message.content));
      if (text && !isArchiveCommandText(text)) {
        return true;
      }
    } catch {
      // Ignore partial or malformed transcript lines.
    }
  }
  return false;
}

async function archiveCurrentSession(entry: SessionEntry | undefined): Promise<string | undefined> {
  const sessionFile = entry?.sessionFile;
  if (!sessionFile || !(await pathExists(sessionFile))) {
    return undefined;
  }
  if (!(await transcriptHasConversationContent(sessionFile))) {
    return undefined;
  }
  const archivedPath = buildArchivePath(sessionFile);
  await fs.rename(sessionFile, archivedPath);
  return archivedPath;
}

function resolveArchiveRestoreDestination(archivePath: string): string {
  return archivePath.replace(ARCHIVE_SUFFIX_RE, ".jsonl");
}

async function restoreArchive(params: {
  archive: TelegramArchive;
  currentEntry?: SessionEntry;
}): Promise<{ sessionFile: string; archivedCurrent?: string }> {
  const destination = resolveArchiveRestoreDestination(params.archive.archivePath);
  const archivedCurrent = await archiveCurrentSession(params.currentEntry);
  if (await pathExists(destination)) {
    await fs.rename(destination, buildArchivePath(destination));
  }
  await fs.rename(params.archive.archivePath, destination);
  return { sessionFile: destination, archivedCurrent };
}

async function switchToArchive(
  params: HandleCommandsParams,
  archive: TelegramArchive,
): Promise<void> {
  if (!params.storePath || !params.sessionStore) {
    throw new Error("session store is unavailable");
  }
  const currentEntry = params.sessionStore[params.sessionKey] ?? params.sessionEntry;
  const restored = await restoreArchive({ archive, currentEntry });
  const now = Date.now();
  const nextEntry: SessionEntry = {
    ...(currentEntry ?? {}),
    sessionId: archive.sessionId,
    sessionFile: restored.sessionFile,
    updatedAt: now,
    lastInteractionAt: now,
    sessionStartedAt: now,
    systemSent: true,
    usageFamilyKey: currentEntry?.usageFamilyKey ?? params.sessionKey,
    usageFamilySessionIds: Array.from(
      new Set([...(currentEntry?.usageFamilySessionIds ?? []), archive.sessionId]),
    ),
  };
  delete nextEntry.status;
  params.sessionStore[params.sessionKey] = nextEntry;
  await updateSessionStore(params.storePath, (store) => {
    store[params.sessionKey] = nextEntry;
  });
}

async function deleteArchive(archive: TelegramArchive): Promise<void> {
  await fs.unlink(archive.archivePath);
}

function resolveCurrentReply(params: HandleCommandsParams): string {
  const entry = params.sessionStore?.[params.sessionKey] ?? params.sessionEntry;
  return [
    `当前 sessionKey: ${params.sessionKey}`,
    `当前 sessionId: ${entry?.sessionId ?? "(unknown)"}`,
    `来源: ${entry?.origin?.provider ?? entry?.lastChannel ?? params.command.channel}`,
  ].join("\n");
}

export const handleTelegramArchivesCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands || !isTelegramCommand(params)) {
    return null;
  }
  const parsed = parseCommand(params.command.commandBodyNormalized);
  if (CURRENT_COMMANDS.has(parsed.command)) {
    return { shouldContinue: false, reply: { text: resolveCurrentReply(params) } };
  }
  if (ARCHIVE_LIST_COMMANDS.has(parsed.command)) {
    const page = parsePositiveIndex(parsed.rest) ?? 1;
    const archives = await listTelegramArchives(params);
    return { shouldContinue: false, reply: { text: formatArchivesReply(archives, page) } };
  }
  if (ARCHIVE_DELETE_COMMANDS.has(parsed.command)) {
    const selector = parseArchiveSelector(parsed.rest);
    if (!selector) {
      return {
        shouldContinue: false,
        reply: { text: "用法：/delete <5位会话码>。先用 /archives 查看会话码。" },
      };
    }
    const archives = await listTelegramArchives(params);
    const archive = archives.find((candidate) => candidate.code === selector);
    if (!archive) {
      return { shouldContinue: false, reply: { text: `没有会话码 ${selector} 对应的归档。` } };
    }
    try {
      await deleteArchive(archive);
    } catch (err) {
      return {
        shouldContinue: false,
        reply: { text: `删除归档失败：${String(err)}` },
      };
    }
    return {
      shouldContinue: false,
      reply: { text: `已删除归档 ${archive.code}。` },
    };
  }
  if (!ARCHIVE_USE_COMMANDS.has(parsed.command)) {
    return null;
  }
  const selector = parseArchiveSelector(parsed.rest);
  if (!selector) {
    return {
      shouldContinue: false,
      reply: { text: "用法：/use <5位会话码>。先用 /archives 查看会话码。" },
    };
  }
  const archives = await listTelegramArchives(params);
  const archive = archives.find((candidate) => candidate.code === selector);
  if (!archive) {
    return { shouldContinue: false, reply: { text: `没有会话码 ${selector} 对应的归档。` } };
  }
  try {
    await switchToArchive(params, archive);
  } catch (err) {
    return {
      shouldContinue: false,
      reply: { text: `切换归档失败：${String(err)}` },
    };
  }
  return {
    shouldContinue: false,
    reply: {
      text: `已切换到归档 ${archive.code}。\n如果切换前的会话不是空会话，已经自动归档。后续消息会继续这个归档会话。`,
    },
  };
};
