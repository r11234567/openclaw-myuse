import crypto from "node:crypto";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { SessionEntry } from "./types.js";

const SHORT_CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SHORT_CODE_LENGTH = 5;
const ARCHIVED_SESSION_KEY_MARKER = ":archived:";

export type SessionArchiveReason = NonNullable<SessionEntry["archiveReason"]>;

function createShortCodeSeed(params: {
  sessionKey: string;
  sessionId?: string;
  attempt: number;
}): string {
  return JSON.stringify({
    sessionKey: params.sessionKey,
    sessionId: params.sessionId ?? "",
    attempt: params.attempt,
  });
}

export function normalizeSessionShortCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]{5}$/.test(normalized) ? normalized : undefined;
}

export function createSessionShortCode(params: {
  existingCodes?: ReadonlySet<string>;
  sessionId?: string;
  sessionKey: string;
}): string {
  const existingCodes = params.existingCodes ?? new Set<string>();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const digest = crypto
      .createHash("sha256")
      .update(
        createShortCodeSeed({
          sessionKey: params.sessionKey,
          sessionId: params.sessionId,
          attempt,
        }),
      )
      .digest();
    let value = digest.readUInt32BE(0);
    let code = "";
    for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
      code += SHORT_CODE_ALPHABET[value % SHORT_CODE_ALPHABET.length];
      value = Math.floor(value / SHORT_CODE_ALPHABET.length);
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(4).toString("hex").slice(0, SHORT_CODE_LENGTH);
}

export function collectSessionShortCodes(
  store: Record<string, SessionEntry>,
  exceptKey?: string,
): Set<string> {
  const codes = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (exceptKey && key === exceptKey) {
      continue;
    }
    const code = normalizeSessionShortCode(entry?.sessionShortCode);
    if (code) {
      codes.add(code);
    }
  }
  return codes;
}

export function buildArchivedSessionKey(params: {
  sessionKey: string;
  shortCode: string;
}): string {
  return `${params.sessionKey}${ARCHIVED_SESSION_KEY_MARKER}${params.shortCode}`;
}

export function isArchivedSessionEntry(entry?: Pick<SessionEntry, "lifecycleState"> | null) {
  return entry?.lifecycleState === "archived";
}

export function isColdSessionEntry(entry?: Pick<SessionEntry, "lifecycleState"> | null) {
  return entry?.lifecycleState === "cold";
}

export function isHiddenSessionLifecycleEntry(
  entry?: Pick<SessionEntry, "lifecycleState"> | null,
) {
  return isArchivedSessionEntry(entry) || isColdSessionEntry(entry);
}

export function hasSessionConversationContent(
  entry:
    | Pick<
        SessionEntry,
        | "sessionId"
        | "systemSent"
        | "inputTokens"
        | "outputTokens"
        | "totalTokens"
        | "lastInteractionAt"
        | "displayName"
        | "subject"
        | "label"
      >
    | undefined
    | null,
): boolean {
  if (!entry) {
    return false;
  }
  if (typeof entry.lastInteractionAt === "number" && entry.lastInteractionAt > 0) {
    return true;
  }
  const numericSignals = [entry.inputTokens, entry.outputTokens, entry.totalTokens];
  if (numericSignals.some((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    return true;
  }
  if (
    normalizeOptionalString(entry.displayName) ||
    normalizeOptionalString(entry.subject) ||
    normalizeOptionalString(entry.label)
  ) {
    return true;
  }
  return Boolean(normalizeOptionalString(entry.sessionId));
}

export function isArchivedSessionKey(key: string): boolean {
  return key.includes(ARCHIVED_SESSION_KEY_MARKER);
}

export function clearSessionEntryDeliveryContext(entry: SessionEntry): SessionEntry {
  const next: SessionEntry = { ...entry };
  delete next.route;
  delete next.deliveryContext;
  delete next.lastChannel;
  delete next.lastTo;
  delete next.lastAccountId;
  delete next.lastThreadId;
  delete next.pendingFinalDelivery;
  delete next.pendingFinalDeliveryCreatedAt;
  delete next.pendingFinalDeliveryLastAttemptAt;
  delete next.pendingFinalDeliveryAttemptCount;
  delete next.pendingFinalDeliveryLastError;
  delete next.pendingFinalDeliveryText;
  delete next.pendingFinalDeliveryContext;
  delete next.pendingFinalDeliveryIntentId;
  delete next.restartRecoveryDeliveryContext;
  delete next.restartRecoveryDeliveryRunId;
  return next;
}

export function createArchivedSessionEntry(params: {
  activeSessionKey: string;
  archivedAt: number;
  archiveReason: SessionArchiveReason;
  existingCodes?: ReadonlySet<string>;
  previousEntry: SessionEntry;
  previousSessionKey: string;
}): { entry: SessionEntry; key: string; shortCode: string } {
  const inheritedCode = normalizeSessionShortCode(params.previousEntry.sessionShortCode);
  const shortCode =
    inheritedCode ??
    createSessionShortCode({
      existingCodes: params.existingCodes,
      sessionId: params.previousEntry.sessionId,
      sessionKey: params.previousSessionKey,
    });
  const displayName =
    normalizeOptionalString(params.previousEntry.displayName) ??
    normalizeOptionalString(params.previousEntry.subject) ??
    normalizeOptionalString(params.previousEntry.label);
  const archived = clearSessionEntryDeliveryContext({
    ...params.previousEntry,
    ...(displayName ? { displayName } : {}),
    lifecycleState: "archived",
    sessionShortCode: shortCode,
    activeSessionKey: params.activeSessionKey,
    archivedFromSessionKey: params.previousSessionKey,
    archivedAt: params.archivedAt,
    archiveReason: params.archiveReason,
    updatedAt: params.archivedAt,
  });
  return {
    entry: archived,
    key: buildArchivedSessionKey({
      sessionKey: params.previousSessionKey,
      shortCode,
    }),
    shortCode,
  };
}

export function resolveActiveSessionLifecycleEntry(params: {
  entry: SessionEntry;
  existingCodes?: ReadonlySet<string>;
  sessionKey: string;
}): SessionEntry {
  const next: SessionEntry = {
    ...params.entry,
    lifecycleState: "active",
    sessionShortCode:
      normalizeSessionShortCode(params.entry.sessionShortCode) ??
      createSessionShortCode({
        existingCodes: params.existingCodes,
        sessionId: params.entry.sessionId,
        sessionKey: params.sessionKey,
      }),
    activeSessionKey: params.sessionKey,
  };
  delete next.archivedFromSessionKey;
  delete next.archivedAt;
  delete next.archiveReason;
  return next;
}

export function createColdSessionEntry(params: {
  coldAt: number;
  previousEntry: SessionEntry;
}): SessionEntry {
  return clearSessionEntryDeliveryContext({
    ...params.previousEntry,
    lifecycleState: "cold",
    updatedAt: params.coldAt,
  });
}
