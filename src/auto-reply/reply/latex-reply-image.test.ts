import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMediaBuffer = vi.hoisted(() => vi.fn());
const sharpFactory = vi.hoisted(() => vi.fn());
const execFileMock = vi.hoisted(() => vi.fn());
const logVerboseMock = vi.hoisted(() => vi.fn());
const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("../../globals.js", () => ({
  logVerbose: logVerboseMock,
}));

vi.mock("../../media/store.js", () => ({
  saveMediaBuffer,
}));

vi.mock("sharp", () => ({
  default: sharpFactory,
}));

import {
  renderLatexReplyPayloadToImageIfNeeded,
  replyTextContainsLatex,
  resetLatexReplyImageFontProbeForTest,
} from "./latex-reply-image.js";

describe("LaTeX reply image rendering", () => {
  beforeEach(() => {
    resetLatexReplyImageFontProbeForTest();
    saveMediaBuffer.mockReset().mockResolvedValue({
      path: "/tmp/openclaw-latex-reply.png",
    });
    execFileMock
      .mockReset()
      .mockImplementation(
        (
          _file: string,
          _args: string[],
          _options: { timeout: number },
          callback: (error: Error | null, stdout: string, stderr: string) => void,
        ) => callback(null, "Noto Sans CJK SC\n", ""),
      );
    logVerboseMock.mockReset();
    sharpFactory.mockReset().mockReturnValue({
      png: vi.fn().mockReturnValue({
        toBuffer: vi.fn().mockResolvedValue(pngBuffer),
      }),
    });
  });

  it("detects common LaTeX while ignoring plain Chinese text", () => {
    expect(replyTextContainsLatex("峰值时间 tp = \\frac{\\pi}{\\omega_d}")).toBe(true);
    expect(replyTextContainsLatex("普通中文回复，不包含公式。")).toBe(false);
  });

  it("renders a text-only LaTeX reply as one PNG payload", async () => {
    const result = await renderLatexReplyPayloadToImageIfNeeded({
      text: "公式：\\frac{\\pi}{\\omega_d}\n说明：中文应该正常显示。",
    });

    expect(result.text).toBeUndefined();
    expect(result.spokenText).toBe("公式：\\frac{\\pi}{\\omega_d}\n说明：中文应该正常显示。");
    expect(result.mediaUrl).toBe("/tmp/openclaw-latex-reply.png");
    expect(result.mediaUrls).toEqual(["/tmp/openclaw-latex-reply.png"]);
    expect(result.trustedLocalMedia).toBe(true);
    expect(result.sensitiveMedia).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "fc-match",
      ["-f", "%{family}\n", "Noto Sans CJK SC"],
      { timeout: 1000 },
      expect.any(Function),
    );
    expect(logVerboseMock).not.toHaveBeenCalled();
    expect(sharpFactory).toHaveBeenCalledTimes(1);
    expect(saveMediaBuffer).toHaveBeenCalledWith(
      pngBuffer,
      "image/png",
      "outbound",
      10 * 1024 * 1024,
      "openclaw-latex-reply.png",
    );
  });

  it("leaves non-LaTeX replies unchanged", async () => {
    const payload = { text: "普通回复" };

    await expect(renderLatexReplyPayloadToImageIfNeeded(payload)).resolves.toBe(payload);
    expect(sharpFactory).not.toHaveBeenCalled();
    expect(saveMediaBuffer).not.toHaveBeenCalled();
  });

  it("logs a concrete hint when a Chinese formula reply lacks CJK font support", async () => {
    execFileMock.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: { timeout: number },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => callback(null, "DejaVu Sans\n", ""),
    );

    await renderLatexReplyPayloadToImageIfNeeded({
      text: "说明：\\frac{1}{K_p}",
    });

    expect(logVerboseMock).toHaveBeenCalledWith(
      expect.stringContaining("Chinese glyphs may render as boxes"),
    );
  });
});
