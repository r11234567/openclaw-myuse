// Lists and switches archived conversation sessions through the shared binding service.
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import {
  applySessionEntryReplacements,
  listSessionEntries,
} from "../../config/sessions/session-accessor.js";
import { resolveSessionStoreEntry } from "../../config/sessions/store.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { readSessionTitleFieldsFromTranscript } from "../../gateway/session-transcript-readers.js";
import { deriveSessionTitle } from "../../gateway/session-utils.js";
import { logVerbose } from "../../globals.js";
import { getSessionBindingService } from "../../infra/outbound/session-binding-service.js";
import type { CommandHandlerResult, HandleCommandsParams } from "./commands-types.js";
import { resolveConversationBindingContextFromAcpCommand } from "./conversation-binding-input.js";

const SESSION_HISTORY_PAGE_SIZE = 10;
const SESSION_HISTORY_ID_LENGTH = 5;
const SESSION_HISTORY_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type SessionHistoryItem = {
  entry: SessionEntry;
  id: string;
  key: string;
  title: string;
};

export function deriveSessionHistoryId(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId, "utf8").digest();
  let value = 0;
  let bits = 0;
  let result = "";
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && result.length < SESSION_HISTORY_ID_LENGTH) {
      bits -= 5;
      result += SESSION_HISTORY_ID_ALPHABET[(value >>> bits) & 31];
    }
    if (result.length === SESSION_HISTORY_ID_LENGTH) {
      return result;
    }
    value &= (1 << bits) - 1;
  }
  return result;
}

function resolveSessionHistoryRootKey(
  store: Record<string, SessionEntry>,
  currentSessionKey: string,
): string {
  let current = currentSessionKey;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const parent = normalizeOptionalString(store[current]?.parentSessionKey);
    if (!parent || !store[parent]) {
      return current;
    }
    current = parent;
  }
  return currentSessionKey;
}

function listSessionHistoryEntries(params: {
  currentSessionKey: string;
  store: Record<string, SessionEntry>;
}): Array<{ key: string; entry: SessionEntry }> {
  const rootKey = resolveSessionHistoryRootKey(params.store, params.currentSessionKey);
  const lineageKeys = new Set([rootKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, entry] of Object.entries(params.store)) {
      if (lineageKeys.has(key) || normalizeOptionalString(entry.spawnedBy)) {
        continue;
      }
      const parentKey = normalizeOptionalString(entry.parentSessionKey);
      if (parentKey && lineageKeys.has(parentKey)) {
        lineageKeys.add(key);
        changed = true;
      }
    }
  }
  return [...lineageKeys]
    .map((key) => ({ key, entry: params.store[key] }))
    .filter((item): item is { key: string; entry: SessionEntry } => Boolean(item.entry));
}

function buildSessionHistoryItems(params: {
  currentSessionKey: string;
  store: Record<string, SessionEntry>;
  storePath: string;
}): SessionHistoryItem[] {
  return listSessionHistoryEntries(params)
    .map(({ key, entry }) => {
      const fields = readSessionTitleFieldsFromTranscript({
        sessionId: entry.sessionId,
        sessionFile: entry.sessionFile,
        storePath: params.storePath,
      });
      return {
        key,
        entry,
        id: deriveSessionHistoryId(entry.sessionId),
        title:
          normalizeOptionalString(entry.label) ??
          deriveSessionTitle(
            { ...entry, displayName: undefined, subject: undefined },
            fields.firstUserMessage,
          ) ??
          "Untitled session",
      };
    })
    .toSorted((left, right) => {
      if (left.key === params.currentSessionKey) {
        return -1;
      }
      if (right.key === params.currentSessionKey) {
        return 1;
      }
      return (right.entry.updatedAt ?? 0) - (left.entry.updatedAt ?? 0);
    });
}

function resolveSessionHistoryUsage(): string {
  return "Usage: /session | /session page <number> | /session <5-character-id> | /session idle <duration|off> | /session max-age <duration|off>";
}

function buildSessionHistoryListReply(params: {
  currentSessionKey: string;
  duplicateIds: Set<string>;
  items: SessionHistoryItem[];
  page: number;
}): CommandHandlerResult {
  const totalPages = Math.max(1, Math.ceil(params.items.length / SESSION_HISTORY_PAGE_SIZE));
  if (params.page > totalPages) {
    return {
      shouldContinue: false,
      reply: {
        text: `Session page ${params.page} does not exist (last page: ${totalPages}).`,
      },
    };
  }
  const offset = (params.page - 1) * SESSION_HISTORY_PAGE_SIZE;
  const lines = [`Sessions (${params.page}/${totalPages})`];
  for (const item of params.items.slice(offset, offset + SESSION_HISTORY_PAGE_SIZE)) {
    const state = item.key === params.currentSessionKey ? "current" : "archived";
    const collision = params.duplicateIds.has(item.id) ? " (ID collision)" : "";
    lines.push(`- [${state}] \`${item.id}\` ${item.title}${collision}`);
  }
  const buttons = [];
  if (params.page > 1) {
    buttons.push({
      label: "Previous",
      action: { type: "command" as const, command: `/session page ${params.page - 1}` },
    });
  }
  if (params.page < totalPages) {
    buttons.push({
      label: "Next",
      action: { type: "command" as const, command: `/session page ${params.page + 1}` },
    });
  }
  return {
    shouldContinue: false,
    reply: {
      text: lines.join("\n"),
      ...(buttons.length > 0
        ? { presentation: { blocks: [{ type: "buttons" as const, buttons }] } }
        : {}),
    },
  };
}

export async function handleSessionHistoryCommand(
  params: HandleCommandsParams,
  tokens: string[],
): Promise<CommandHandlerResult> {
  const bindingContext = resolveConversationBindingContextFromAcpCommand(params);
  if (!bindingContext || !params.storePath) {
    return {
      shouldContinue: false,
      reply: { text: "Session history is not available in this conversation." },
    };
  }
  const sessionBindingService = getSessionBindingService();
  const capabilities = sessionBindingService.getCapabilities({
    channel: bindingContext.channel,
    accountId: bindingContext.accountId,
  });
  if (!capabilities.archiveCurrentSessionOnNew || !capabilities.bindSupported) {
    return { shouldContinue: false, reply: { text: resolveSessionHistoryUsage() } };
  }

  const activeBinding = sessionBindingService.resolveByConversation(bindingContext);
  const activeSessionKey = activeBinding?.targetSessionKey ?? params.sessionKey;
  const store = Object.fromEntries(
    listSessionEntries({ storePath: params.storePath }).map(({ sessionKey, entry }) => [
      sessionKey,
      entry,
    ]),
  );
  const active = resolveSessionStoreEntry({ store, sessionKey: activeSessionKey });
  if (!active.existing) {
    return {
      shouldContinue: false,
      reply: { text: "The current session is not available in the Gateway session store." },
    };
  }
  const currentSessionKey = active.normalizedKey;
  const items = buildSessionHistoryItems({
    currentSessionKey,
    store,
    storePath: params.storePath,
  });
  const idCounts = new Map<string, number>();
  for (const item of items) {
    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  }
  const duplicateIds = new Set(
    [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );

  const action = normalizeOptionalLowercaseString(tokens[0]);
  if (tokens.length === 0 || action === "page") {
    const pageRaw = action === "page" ? tokens[1] : undefined;
    const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
    if ((action === "page" && tokens.length !== 2) || !Number.isSafeInteger(page) || page < 1) {
      return { shouldContinue: false, reply: { text: resolveSessionHistoryUsage() } };
    }
    return buildSessionHistoryListReply({
      currentSessionKey,
      duplicateIds,
      items,
      page,
    });
  }

  if (tokens.length !== 1) {
    return { shouldContinue: false, reply: { text: resolveSessionHistoryUsage() } };
  }
  const requestedId = tokens[0]?.toUpperCase() ?? "";
  const validId = new RegExp(
    `^[${SESSION_HISTORY_ID_ALPHABET}]{${SESSION_HISTORY_ID_LENGTH}}$`,
  ).test(requestedId);
  if (!validId) {
    return { shouldContinue: false, reply: { text: resolveSessionHistoryUsage() } };
  }
  const matches = items.filter((item) => item.id === requestedId);
  if (matches.length === 0) {
    return {
      shouldContinue: false,
      reply: { text: `No session with ID \`${requestedId}\` exists in this conversation.` },
    };
  }
  if (matches.length > 1) {
    return {
      shouldContinue: false,
      reply: { text: `Session ID \`${requestedId}\` is ambiguous because of a hash collision.` },
    };
  }
  const target = matches[0];
  if (!target || target.key === currentSessionKey) {
    return {
      shouldContinue: false,
      reply: { text: `Session \`${requestedId}\` is already current.` },
    };
  }

  let previousEntries: {
    previous: { current: SessionEntry; target: SessionEntry };
    switched: { current: SessionEntry; target: SessionEntry };
  } | null;
  try {
    previousEntries = await applySessionEntryReplacements({
      activeSessionKey: target.key,
      requireWriteSuccess: true,
      sessionKeys: [currentSessionKey, target.key],
      storePath: params.storePath,
      update: (entries) => {
        const entriesByKey = new Map(entries.map((item) => [item.sessionKey, item.entry]));
        const currentEntry = entriesByKey.get(currentSessionKey);
        const targetEntry = entriesByKey.get(target.key);
        if (!currentEntry || !targetEntry) {
          return { result: null };
        }
        const currentReplacement = {
          ...currentEntry,
          archivedAt: currentEntry.archivedAt ?? Date.now(),
        };
        delete currentReplacement.pinnedAt;
        const targetReplacement = { ...targetEntry };
        delete targetReplacement.archivedAt;
        return {
          result: {
            previous: {
              current: { ...currentEntry },
              target: { ...targetEntry },
            },
            switched: {
              current: currentReplacement,
              target: targetReplacement,
            },
          },
          replacements: [
            { sessionKey: currentSessionKey, entry: currentReplacement },
            { sessionKey: target.key, entry: targetReplacement },
          ],
        };
      },
    });
  } catch (error) {
    logVerbose(`session switch row update failed: ${String(error)}`);
    previousEntries = null;
  }
  if (!previousEntries) {
    return {
      shouldContinue: false,
      reply: { text: "The session list changed before the switch; run /session and try again." },
    };
  }

  try {
    await sessionBindingService.bind({
      targetSessionKey: target.key,
      targetKind: "session",
      conversation: bindingContext,
      placement: "current",
      metadata: {
        ...activeBinding?.metadata,
        boundBy:
          normalizeOptionalString(params.command.senderId) ??
          normalizeOptionalString(activeBinding?.metadata?.boundBy) ??
          "system",
      },
    });
  } catch (error) {
    let rowsRestored = false;
    try {
      rowsRestored = await applySessionEntryReplacements({
        activeSessionKey: currentSessionKey,
        requireWriteSuccess: true,
        sessionKeys: [currentSessionKey, target.key],
        storePath: params.storePath,
        update: (entries) => {
          const entriesByKey = new Map(entries.map((item) => [item.sessionKey, item.entry]));
          if (
            !isDeepStrictEqual(
              entriesByKey.get(currentSessionKey),
              previousEntries.switched.current,
            ) ||
            !isDeepStrictEqual(entriesByKey.get(target.key), previousEntries.switched.target)
          ) {
            return { result: false };
          }
          return {
            result: true,
            replacements: [
              { sessionKey: currentSessionKey, entry: previousEntries.previous.current },
              { sessionKey: target.key, entry: previousEntries.previous.target },
            ],
          };
        },
      });
    } catch {
      // A concurrent row change is safer to preserve than overwrite during rollback.
    }
    try {
      await sessionBindingService.bind({
        targetSessionKey: currentSessionKey,
        targetKind: activeBinding?.targetKind ?? "session",
        conversation: bindingContext,
        placement: "current",
        metadata: activeBinding?.metadata,
      });
    } catch {
      // The restored active row remains visible for operator recovery.
    }
    logVerbose(`session switch binding failed: ${String(error)}`);
    return {
      shouldContinue: false,
      reply: {
        text: rowsRestored
          ? "Failed to switch the conversation binding; the prior session was restored."
          : "Failed to switch the conversation binding; session rows changed concurrently and were left untouched.",
      },
    };
  }
  return {
    shouldContinue: false,
    reply: { text: `Switched to \`${requestedId}\`: ${target.title}` },
  };
}
