import { describe, expect, it } from "vitest";
import {
  createColdSessionEntry,
  createArchivedSessionEntry,
  hasSessionConversationContent,
  resolveActiveSessionLifecycleEntry,
} from "./session-lifecycle.js";
import type { SessionEntry } from "./types.js";

describe("session lifecycle metadata", () => {
  it("archives an entry by state while clearing delivery context", () => {
    const previousEntry = {
      sessionId: "session-old",
      sessionFile: "/tmp/session-old.jsonl",
      updatedAt: 1,
      displayName: "Old topic",
      sessionShortCode: "old01",
      route: { channel: "telegram", target: { to: "chat-1" } },
      deliveryContext: { channel: "telegram", to: "chat-1", accountId: "main" },
      lastChannel: "telegram",
      lastTo: "chat-1",
      lastAccountId: "main",
      pendingFinalDelivery: true,
      pendingFinalDeliveryText: "reply",
      pendingFinalDeliveryContext: { channel: "telegram", to: "chat-1" },
      restartRecoveryDeliveryContext: { channel: "telegram", to: "chat-1" },
      restartRecoveryDeliveryRunId: "run-1",
    } satisfies SessionEntry;

    const archived = createArchivedSessionEntry({
      activeSessionKey: "agent:main:telegram:direct:chat-1",
      archivedAt: 123,
      archiveReason: "new",
      previousEntry,
      previousSessionKey: "agent:main:telegram:direct:chat-1",
    });

    expect(archived).toMatchObject({
      key: "agent:main:telegram:direct:chat-1:archived:old01",
      shortCode: "old01",
      entry: {
        sessionId: "session-old",
        sessionFile: "/tmp/session-old.jsonl",
        lifecycleState: "archived",
        archivedAt: 123,
        archiveReason: "new",
        sessionShortCode: "old01",
        activeSessionKey: "agent:main:telegram:direct:chat-1",
      },
    });
    expect(archived.entry.route).toBeUndefined();
    expect(archived.entry.deliveryContext).toBeUndefined();
    expect(archived.entry.lastChannel).toBeUndefined();
    expect(archived.entry.pendingFinalDelivery).toBeUndefined();
    expect(archived.entry.pendingFinalDeliveryText).toBeUndefined();
    expect(archived.entry.pendingFinalDeliveryContext).toBeUndefined();
    expect(archived.entry.restartRecoveryDeliveryContext).toBeUndefined();
    expect(archived.entry.restartRecoveryDeliveryRunId).toBeUndefined();
  });

  it("marks new route entries active with a stable short code", () => {
    const active = resolveActiveSessionLifecycleEntry({
      entry: { sessionId: "session-new", updatedAt: 456 },
      existingCodes: new Set(["abc12"]),
      sessionKey: "agent:main:telegram:direct:chat-1",
    });

    expect(active.lifecycleState).toBe("active");
    expect(active.activeSessionKey).toBe("agent:main:telegram:direct:chat-1");
    expect(active.sessionShortCode).toMatch(/^[a-z0-9]{5}$/);
    expect(active.archivedAt).toBeUndefined();
  });

  it("cold-stores an entry by state while clearing delivery context", () => {
    const cold = createColdSessionEntry({
      coldAt: 789,
      previousEntry: {
        sessionId: "session-old",
        sessionFile: "/tmp/session-old.jsonl",
        updatedAt: 1,
        route: { channel: "telegram", target: { to: "chat-1" } },
        deliveryContext: { channel: "telegram", to: "chat-1", accountId: "main" },
        pendingFinalDelivery: true,
        restartRecoveryDeliveryContext: { channel: "telegram", to: "chat-1" },
      } satisfies SessionEntry,
    });

    expect(cold.lifecycleState).toBe("cold");
    expect(cold.updatedAt).toBe(789);
    expect(cold.sessionId).toBe("session-old");
    expect(cold.route).toBeUndefined();
    expect(cold.deliveryContext).toBeUndefined();
    expect(cold.pendingFinalDelivery).toBeUndefined();
    expect(cold.restartRecoveryDeliveryContext).toBeUndefined();
  });

  it("classifies empty entries without transcript identity or activity", () => {
    expect(hasSessionConversationContent(undefined)).toBe(false);
    expect(hasSessionConversationContent({ sessionId: "", updatedAt: 1 })).toBe(false);
    expect(hasSessionConversationContent({ sessionId: "session-1", updatedAt: 1 })).toBe(true);
    expect(hasSessionConversationContent({ sessionId: "", updatedAt: 1, inputTokens: 1 })).toBe(
      true,
    );
  });
});
