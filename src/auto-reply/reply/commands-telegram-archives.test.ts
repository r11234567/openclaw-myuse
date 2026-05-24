import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { MsgContext } from "../templating.js";
import { handleTelegramArchivesCommand } from "./commands-telegram-archives.js";
import type { HandleCommandsParams } from "./commands-types.js";

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

async function makeTempSessionsDir(): Promise<string> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tg-archives-"));
  return tmpDir;
}

function transcriptLine(entry: unknown): string {
  return `${JSON.stringify(entry)}\n`;
}

function telegramUserMessage(chatId: string, text: string): string {
  return transcriptLine({
    type: "message",
    id: `msg-${chatId}-${text}`,
    message: {
      role: "user",
      content: `Conversation info (untrusted metadata): {"chat_id":"telegram:${chatId}"}\n\n${text}`,
    },
  });
}

function telegramAssistantMessage(text: string): string {
  return transcriptLine({
    type: "message",
    id: `assistant-${text}`,
    message: {
      role: "assistant",
      content: text,
    },
  });
}

function branchSummaryLine(summary: string): string {
  return transcriptLine({
    type: "branch_summary",
    summary,
  });
}

async function writeTranscript(filePath: string, sessionId: string, chatId: string): Promise<void> {
  await fs.writeFile(
    filePath,
    transcriptLine({ type: "session", id: sessionId }) +
      telegramUserMessage(chatId, `hello from ${sessionId}`),
  );
}

function buildParams(input: {
  command: string;
  sessionsDir: string;
  sessionKey?: string;
  sessionStore?: HandleCommandsParams["sessionStore"];
  sessionEntry?: HandleCommandsParams["sessionEntry"];
  chatId?: string;
}): HandleCommandsParams {
  const chatId = input.chatId ?? "111";
  const ctx = {
    Provider: "telegram",
    Surface: "telegram",
    OriginatingChannel: "telegram",
    OriginatingTo: `telegram:${chatId}`,
    To: `telegram:${chatId}`,
    From: "telegram:bot",
    CommandSource: "text",
    CommandAuthorized: true,
  } as MsgContext;
  return {
    ctx,
    cfg: { commands: { text: true } } as OpenClawConfig,
    command: {
      surface: "telegram",
      channel: "telegram",
      rawBodyNormalized: input.command,
      commandBodyNormalized: input.command,
      isAuthorizedSender: true,
      senderIsOwner: true,
      ownerList: [],
      from: "telegram:bot",
      to: `telegram:${chatId}`,
    },
    directives: {},
    elevated: { enabled: true, allowed: true, failures: [] },
    sessionKey: input.sessionKey ?? `agent:main:telegram:direct:${chatId}`,
    sessionEntry: input.sessionEntry,
    sessionStore: input.sessionStore,
    storePath: path.join(input.sessionsDir, "sessions.json"),
    workspaceDir: input.sessionsDir,
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "test",
    model: "test",
    contextTokens: 0,
    isGroup: false,
  } as HandleCommandsParams;
}

describe("handleTelegramArchivesCommand", () => {
  it("lists only reset archives for the current Telegram chat", async () => {
    const dir = await makeTempSessionsDir();
    await writeTranscript(
      path.join(dir, "tg-old.jsonl.reset.2026-05-20T10-00-00.000Z"),
      "tg-old",
      "111",
    );
    await writeTranscript(
      path.join(dir, "other-chat.jsonl.reset.2026-05-20T11-00-00.000Z"),
      "other-chat",
      "222",
    );
    await fs.writeFile(
      path.join(dir, "command-only.jsonl.reset.2026-05-20T11-30-00.000Z"),
      transcriptLine({ type: "session", id: "command-only" }) + telegramUserMessage("111", "/new"),
    );
    await fs.writeFile(
      path.join(dir, "dashboard.jsonl.reset.2026-05-20T12-00-00.000Z"),
      transcriptLine({ type: "session", id: "dashboard" }) +
        transcriptLine({
          type: "message",
          message: { role: "user", content: "dashboard only" },
        }),
    );

    const result = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain("hello from tg-old");
    expect(result?.reply?.text).toMatch(/`[a-z0-9]{5}`/u);
    expect(result?.reply?.text).not.toContain("other-chat");
    expect(result?.reply?.text).not.toContain("command-only");
    expect(result?.reply?.text).not.toContain("dashboard");
  });

  it("prefers an archive summary over the latest user message", async () => {
    const dir = await makeTempSessionsDir();
    const archivedPath = path.join(dir, "topic.jsonl.reset.2026-05-20T10-00-00.000Z");
    await fs.writeFile(
      archivedPath,
      transcriptLine({ type: "session", id: "topic" }) +
        telegramUserMessage("111", "先讨论 gateway restart") +
        branchSummaryLine("会话总结：gateway restart completed successfully") +
        telegramUserMessage("111", "最后一句只是补充说明") +
        telegramAssistantMessage("The gateway restart completed successfully. Tell the operator to retry."),
    );

    const result = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );

    expect(result?.reply?.text).toContain("会话总结：gateway restart completed successfully");
    expect(result?.reply?.text).not.toContain("最后一句只是补充说明");
    expect(result?.reply?.text).not.toContain("The gateway restart completed successfully");
  });

  it("keeps archive codes stable at five characters", async () => {
    const dir = await makeTempSessionsDir();
    const archivedPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    await writeTranscript(archivedPath, "old", "111");

    const firstResult = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );
    const firstCode = /`([a-z0-9]{5})`/u.exec(firstResult?.reply?.text ?? "")?.[1];
    expect(firstCode).toMatch(/^[a-z0-9]{5}$/u);

    const renamedPath = path.join(dir, "old-renamed.jsonl.reset.2026-05-20T10-00-00.000Z");
    await fs.rename(archivedPath, renamedPath);

    const secondResult = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );
    const secondCode = /`([a-z0-9]{5})`/u.exec(secondResult?.reply?.text ?? "")?.[1];
    expect(secondCode).toBe(firstCode);
  });

  it("archives the current Telegram session and restores the selected archive", async () => {
    const dir = await makeTempSessionsDir();
    const sessionKey = "agent:main:telegram:direct:111";
    const currentPath = path.join(dir, "current.jsonl");
    const archivedPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    const restoredPath = path.join(dir, "old.jsonl");
    await writeTranscript(currentPath, "current", "111");
    await writeTranscript(archivedPath, "old", "111");
    const sessionStore = {
      [sessionKey]: {
        sessionId: "current",
        sessionFile: currentPath,
        updatedAt: 1,
        sessionStartedAt: 1,
      },
    };
    await fs.writeFile(path.join(dir, "sessions.json"), `${JSON.stringify(sessionStore)}\n`);
    const listResult = await handleTelegramArchivesCommand(
      buildParams({
        command: "/archives",
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    const archiveCode = /`([a-z0-9]{5,})`/u.exec(listResult?.reply?.text ?? "")?.[1];
    expect(archiveCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({
        command: `/use ${archiveCode}`,
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toContain(`已切换到归档 ${archiveCode}`);
    await expect(fs.access(restoredPath)).resolves.toBeUndefined();
    await expect(fs.access(archivedPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(currentPath)).rejects.toMatchObject({ code: "ENOENT" });
    const names = await fs.readdir(dir);
    expect(names.some((name) => name.startsWith("current.jsonl.reset."))).toBe(true);
    expect(sessionStore[sessionKey]?.sessionId).toBe("old");
    expect(sessionStore[sessionKey]?.sessionFile).toBe(restoredPath);
    const persisted = JSON.parse(await fs.readFile(path.join(dir, "sessions.json"), "utf8"));
    expect(persisted[sessionKey].sessionId).toBe("old");
    expect(persisted[sessionKey].sessionFile).toBe(restoredPath);
  });

  it("keeps an archive code stable after switching and re-archiving the same conversation", async () => {
    const dir = await makeTempSessionsDir();
    const sessionKey = "agent:main:telegram:direct:111";
    const currentPath = path.join(dir, "current.jsonl");
    const archivedPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    const reboundPath = path.join(dir, "old.jsonl.reset.2026-05-20T12-00-00.000Z");
    const restoredPath = path.join(dir, "old.jsonl");
    await writeTranscript(currentPath, "current", "111");
    await writeTranscript(archivedPath, "old", "111");
    const sessionStore = {
      [sessionKey]: {
        sessionId: "current",
        sessionFile: currentPath,
        updatedAt: 1,
        sessionStartedAt: 1,
      },
    };
    await fs.writeFile(path.join(dir, "sessions.json"), `${JSON.stringify(sessionStore)}\n`);
    const listResult = await handleTelegramArchivesCommand(
      buildParams({
        command: "/archives",
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    const archiveCode = /`([a-z0-9]{5,})`/u.exec(listResult?.reply?.text ?? "")?.[1];
    expect(archiveCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({
        command: `/use ${archiveCode}`,
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    expect(result?.shouldContinue).toBe(false);
    await expect(fs.access(restoredPath)).resolves.toBeUndefined();

    await fs.rename(restoredPath, reboundPath);

    const afterRearchive = await handleTelegramArchivesCommand(
      buildParams({
        command: "/archives",
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    expect(afterRearchive?.reply?.text).toContain(`\`${archiveCode}\``);
    expect(afterRearchive?.reply?.text).not.toContain("current");
  });

  it("deletes the selected archive for the current Telegram chat", async () => {
    const dir = await makeTempSessionsDir();
    const targetPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    const otherChatPath = path.join(dir, "other.jsonl.reset.2026-05-20T11-00-00.000Z");
    await writeTranscript(targetPath, "old", "111");
    await writeTranscript(otherChatPath, "other", "222");
    const listResult = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );
    const archiveCode = /`([a-z0-9]{5,})`/u.exec(listResult?.reply?.text ?? "")?.[1];
    expect(archiveCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({ command: `/delete ${archiveCode}`, sessionsDir: dir }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toBe(`已删除归档 ${archiveCode}。`);
    await expect(fs.access(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(otherChatPath)).resolves.toBeUndefined();
    const afterList = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir }),
      true,
    );
    expect(afterList?.reply?.text).toBe("没有找到当前聊天的归档会话。");
  });

  it("keeps delete scoped to archive codes from the current Telegram chat", async () => {
    const dir = await makeTempSessionsDir();
    const otherChatPath = path.join(dir, "other.jsonl.reset.2026-05-20T11-00-00.000Z");
    await writeTranscript(otherChatPath, "other", "222");
    const otherList = await handleTelegramArchivesCommand(
      buildParams({ command: "/archives", sessionsDir: dir, chatId: "222" }),
      true,
    );
    const otherCode = /`([a-z0-9]{5,})`/u.exec(otherList?.reply?.text ?? "")?.[1];
    expect(otherCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({ command: `/delete ${otherCode}`, sessionsDir: dir, chatId: "111" }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    expect(result?.reply?.text).toBe(`没有会话码 ${otherCode} 对应的归档。`);
    await expect(fs.access(otherChatPath)).resolves.toBeUndefined();
  });

  it("does not archive an empty current Telegram session before switching", async () => {
    const dir = await makeTempSessionsDir();
    const sessionKey = "agent:main:telegram:direct:111";
    const currentPath = path.join(dir, "current.jsonl");
    const archivedPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    const restoredPath = path.join(dir, "old.jsonl");
    await fs.writeFile(currentPath, transcriptLine({ type: "session", id: "current" }));
    await writeTranscript(archivedPath, "old", "111");
    const sessionStore = {
      [sessionKey]: {
        sessionId: "current",
        sessionFile: currentPath,
        updatedAt: 1,
        sessionStartedAt: 1,
      },
    };
    await fs.writeFile(path.join(dir, "sessions.json"), `${JSON.stringify(sessionStore)}\n`);
    const listResult = await handleTelegramArchivesCommand(
      buildParams({
        command: "/archives",
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    const archiveCode = /`([a-z0-9]{5,})`/u.exec(listResult?.reply?.text ?? "")?.[1];
    expect(archiveCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({
        command: `/use ${archiveCode}`,
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    await expect(fs.access(restoredPath)).resolves.toBeUndefined();
    const names = await fs.readdir(dir);
    expect(names.some((name) => name.startsWith("current.jsonl.reset."))).toBe(false);
  });

  it("does not archive a command-only current Telegram session before switching", async () => {
    const dir = await makeTempSessionsDir();
    const sessionKey = "agent:main:telegram:direct:111";
    const currentPath = path.join(dir, "current.jsonl");
    const archivedPath = path.join(dir, "old.jsonl.reset.2026-05-20T10-00-00.000Z");
    const restoredPath = path.join(dir, "old.jsonl");
    await fs.writeFile(
      currentPath,
      transcriptLine({ type: "session", id: "current" }) + telegramUserMessage("111", "/new"),
    );
    await writeTranscript(archivedPath, "old", "111");
    const sessionStore = {
      [sessionKey]: {
        sessionId: "current",
        sessionFile: currentPath,
        updatedAt: 1,
        sessionStartedAt: 1,
      },
    };
    await fs.writeFile(path.join(dir, "sessions.json"), `${JSON.stringify(sessionStore)}\n`);
    const listResult = await handleTelegramArchivesCommand(
      buildParams({
        command: "/archives",
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );
    const archiveCode = /`([a-z0-9]{5,})`/u.exec(listResult?.reply?.text ?? "")?.[1];
    expect(archiveCode).toBeTruthy();

    const result = await handleTelegramArchivesCommand(
      buildParams({
        command: `/use ${archiveCode}`,
        sessionsDir: dir,
        sessionKey,
        sessionStore,
        sessionEntry: sessionStore[sessionKey],
      }),
      true,
    );

    expect(result?.shouldContinue).toBe(false);
    await expect(fs.access(restoredPath)).resolves.toBeUndefined();
    const names = await fs.readdir(dir);
    expect(names.some((name) => name.startsWith("current.jsonl.reset."))).toBe(false);
  });
});
