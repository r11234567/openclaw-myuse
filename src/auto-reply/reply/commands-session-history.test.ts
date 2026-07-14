import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { SessionBindingRecord } from "../../infra/outbound/session-binding-service.js";
import type { HandleCommandsParams } from "./commands-types.js";

const hoisted = vi.hoisted(() => ({
  bind: vi.fn(),
  binding: null as SessionBindingRecord | null,
  store: {} as Record<string, SessionEntry>,
}));

vi.mock("../../config/sessions/session-accessor.js", () => ({
  listSessionEntries: () =>
    Object.entries(hoisted.store).map(([sessionKey, entry]) => ({ sessionKey, entry })),
  applySessionEntryReplacements: async (params: {
    sessionKeys?: string[];
    update: (entries: Array<{ sessionKey: string; entry: SessionEntry }>) =>
      | Promise<{
          result: unknown;
          replacements?: Array<{ sessionKey: string; entry: SessionEntry }>;
        }>
      | {
          result: unknown;
          replacements?: Array<{ sessionKey: string; entry: SessionEntry }>;
        };
  }) => {
    const keys = params.sessionKeys ?? Object.keys(hoisted.store);
    const operation = await params.update(
      keys.flatMap((sessionKey) => {
        const entry = hoisted.store[sessionKey];
        return entry ? [{ sessionKey, entry: { ...entry } }] : [];
      }),
    );
    for (const replacement of operation.replacements ?? []) {
      hoisted.store[replacement.sessionKey] = { ...replacement.entry };
    }
    return operation.result;
  },
}));

vi.mock("../../config/sessions/store.js", () => ({
  resolveSessionStoreEntry: ({
    store,
    sessionKey,
  }: {
    store: Record<string, SessionEntry>;
    sessionKey: string;
  }) => ({
    existing: store[sessionKey],
    normalizedKey: sessionKey,
    legacyKeys: [],
  }),
}));

vi.mock("../../gateway/session-transcript-readers.js", () => ({
  readSessionTitleFieldsFromTranscript: () => ({ firstUserMessage: null }),
}));

vi.mock("../../gateway/session-utils.js", () => ({
  deriveSessionTitle: (entry: SessionEntry | undefined) => entry?.label,
}));

vi.mock("../../globals.js", () => ({ logVerbose: vi.fn() }));

vi.mock("../../infra/outbound/session-binding-service.js", () => ({
  getSessionBindingService: () => ({
    bind: hoisted.bind,
    getCapabilities: () => ({
      adapterAvailable: true,
      bindSupported: true,
      unbindSupported: true,
      placements: ["current"],
      archiveCurrentSessionOnNew: true,
    }),
    listBySession: vi.fn(),
    resolveByConversation: () => hoisted.binding,
    touch: vi.fn(),
    unbind: vi.fn(),
  }),
}));

vi.mock("./conversation-binding-input.js", () => ({
  resolveConversationBindingContextFromAcpCommand: () => ({
    channel: "telegram",
    accountId: "default",
    conversationId: "12345",
  }),
}));

import { deriveSessionHistoryId, handleSessionHistoryCommand } from "./commands-session-history.js";

const ROOT_KEY = "agent:main:telegram:direct:12345";

function createParams(): HandleCommandsParams {
  return {
    ctx: {},
    cfg: {},
    command: {
      surface: "telegram",
      channel: "telegram",
      isAuthorizedSender: true,
      senderIsOwner: true,
      ownerList: [],
      senderId: "12345",
      rawBodyNormalized: "/session",
      commandBodyNormalized: "/session",
    },
    directives: {} as HandleCommandsParams["directives"],
    elevated: { enabled: true, allowed: true, failures: [] },
    sessionKey: "agent:main:dashboard:child-11",
    storePath: "/tmp/sessions.json",
    workspaceDir: "/tmp",
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "test",
    model: "test",
    contextTokens: 0,
    isGroup: false,
  };
}

beforeEach(() => {
  hoisted.store = {
    [ROOT_KEY]: {
      sessionId: "session-root",
      updatedAt: 1,
      archivedAt: 1,
      label: "Root title",
    },
  };
  for (let index = 1; index <= 11; index += 1) {
    const key = `agent:main:dashboard:child-${index}`;
    hoisted.store[key] = {
      sessionId: `session-child-${index}`,
      updatedAt: index + 1,
      parentSessionKey: ROOT_KEY,
      archivedAt: index === 11 ? undefined : index + 1,
      label: `Child title ${index}`,
    };
  }
  hoisted.binding = {
    bindingId: "telegram:default:12345",
    targetSessionKey: "agent:main:dashboard:child-11",
    targetKind: "session",
    conversation: {
      channel: "telegram",
      accountId: "default",
      conversationId: "12345",
    },
    status: "active",
    boundAt: 1,
  };
  hoisted.bind.mockReset().mockImplementation(async (input) => {
    hoisted.binding = {
      ...hoisted.binding!,
      targetSessionKey: input.targetSessionKey,
    };
    return hoisted.binding;
  });
});

describe("conversation session history", () => {
  it("lists ten sessions per page with only navigation buttons", async () => {
    const first = await handleSessionHistoryCommand(createParams(), []);
    expect(first.reply?.text?.split("\n")).toHaveLength(11);
    expect(first.reply?.text).toContain("Sessions (1/2)");
    expect(first.reply?.text).toContain("[current]");
    expect(first.reply?.presentation?.blocks).toEqual([
      {
        type: "buttons",
        buttons: [
          {
            label: "Next",
            action: { type: "command", command: "/session page 2" },
          },
        ],
      },
    ]);

    const second = await handleSessionHistoryCommand(createParams(), ["page", "2"]);
    expect(second.reply?.text?.split("\n")).toHaveLength(3);
    expect(second.reply?.presentation?.blocks).toEqual([
      {
        type: "buttons",
        buttons: [
          {
            label: "Previous",
            action: { type: "command", command: "/session page 1" },
          },
        ],
      },
    ]);
  });

  it("switches the binding while archiving the previous current row", async () => {
    const requestedId = deriveSessionHistoryId(hoisted.store[ROOT_KEY]!.sessionId);
    const result = await handleSessionHistoryCommand(createParams(), [requestedId]);

    expect(result.reply?.text).toContain(`\`${requestedId}\``);
    expect(hoisted.store["agent:main:dashboard:child-11"]?.archivedAt).toEqual(expect.any(Number));
    expect(hoisted.store[ROOT_KEY]?.archivedAt).toBeUndefined();
    expect(hoisted.bind).toHaveBeenCalledWith(
      expect.objectContaining({ targetSessionKey: ROOT_KEY, placement: "current" }),
    );
  });

  it("restores both rows when rebinding fails", async () => {
    const currentKey = "agent:main:dashboard:child-11";
    const currentBefore = { ...hoisted.store[currentKey]! };
    const targetBefore = { ...hoisted.store[ROOT_KEY]! };
    hoisted.bind.mockRejectedValueOnce(new Error("bind failed"));
    const requestedId = deriveSessionHistoryId(hoisted.store[ROOT_KEY]!.sessionId);

    const result = await handleSessionHistoryCommand(createParams(), [requestedId]);

    expect(result.reply?.text).toContain("prior session was restored");
    expect(hoisted.store[currentKey]).toEqual(currentBefore);
    expect(hoisted.store[ROOT_KEY]).toEqual(targetBefore);
  });
});
