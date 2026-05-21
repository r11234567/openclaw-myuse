import { normalizeOptionalLowercaseString } from "../shared/string-coerce.js";
import type { ChatCommandDefinition } from "./commands-registry.types.js";

const TELEGRAM_ZH_COMMAND_DESCRIPTIONS: Record<string, string> = {
  help: "显示常用命令帮助。",
  commands: "查看全部可用命令。",
  tools: "查看当前可用工具。",
  skill: "按名称运行一个技能。",
  status: "查看当前运行状态。",
  diagnostics: "生成诊断报告。",
  crestodian: "运行安装和修复助手。",
  tasks: "查看当前会话后台任务。",
  allowlist: "管理允许列表。",
  approve: "批准或拒绝执行请求。",
  context: "查看上下文构建方式。",
  btw: "问一个不写入后续上下文的旁路问题。",
  "export-session": "导出当前会话为 HTML。",
  "export-trajectory": "导出当前会话轨迹。",
  tts: "控制文字转语音。",
  whoami: "显示你的发送者 ID。",
  session: "管理会话级设置。",
  subagents: "管理子代理运行。",
  acp: "管理 ACP 会话和运行选项。",
  focus: "把当前话题或会话绑定到目标。",
  unfocus: "移除当前绑定。",
  agents: "查看绑定的代理。",
  kill: "终止正在运行的子代理。",
  steer: "给当前运行发送指导。",
  config: "查看或修改配置。",
  mcp: "查看或修改 MCP 服务器。",
  plugins: "管理插件。",
  debug: "设置运行时调试选项。",
  usage: "查看或设置用量显示。",
  stop: "停止当前运行。",
  restart: "重启 OpenClaw。",
  activation: "设置群聊唤醒方式。",
  send: "设置回复发送策略。",
  reset: "重置当前会话。",
  new: "归档当前会话并开始新会话。",
  archives: "查看当前聊天的归档会话。",
  use: "切换到指定归档会话。",
  delete: "删除指定归档会话。",
  current: "查看当前会话标识。",
  compact: "压缩当前会话上下文。",
  think: "设置思考强度。",
  verbose: "切换详细输出。",
  trace: "切换插件调试输出。",
  fast: "切换快速模式。",
  reasoning: "切换推理内容显示。",
  elevated: "切换增强执行模式。",
  exec: "设置执行工具默认策略。",
  model: "查看或切换模型。",
  models: "列出模型提供源和模型。",
  queue: "调整队列策略。",
  bash: "运行主机 shell 命令。",
};

export function isChineseCommandSurface(surface?: string): boolean {
  return normalizeOptionalLowercaseString(surface) === "telegram";
}

export function localizeCommandCategoryLabel(label: string, surface?: string): string {
  if (!isChineseCommandSurface(surface)) {
    return label;
  }
  switch (label) {
    case "Session":
      return "会话";
    case "Options":
      return "选项";
    case "Status":
      return "状态";
    case "Management":
      return "管理";
    case "Media":
      return "媒体";
    case "Tools":
      return "工具";
    case "Docks":
      return "频道切换";
    case "Plugins":
      return "插件";
    default:
      return label;
  }
}

export function localizeCommandDescription(
  command: Pick<ChatCommandDefinition, "key" | "description">,
  surface?: string,
): string {
  if (!isChineseCommandSurface(surface)) {
    return command.description;
  }
  if (command.key.startsWith("dock:")) {
    return "把当前会话的回复切换到对应频道。";
  }
  return TELEGRAM_ZH_COMMAND_DESCRIPTIONS[command.key] ?? command.description;
}
