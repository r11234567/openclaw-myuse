import type { SkillCommandSpec } from "../agents/skills.js";
import { getChannelPlugin } from "../channels/plugins/index.js";
import { isCommandFlagEnabled } from "../config/commands.flags.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { listPluginCommands } from "../plugins/commands.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../shared/string-coerce.js";
import {
  isChineseCommandSurface,
  localizeCommandCategoryLabel,
  localizeCommandDescription,
} from "./commands-localization.js";
import {
  listChatCommands,
  listChatCommandsForConfig,
  type ChatCommandDefinition,
} from "./commands-registry.js";
import type { CommandCategory } from "./commands-registry.types.js";

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  session: "Session",
  options: "Options",
  status: "Status",
  management: "Management",
  media: "Media",
  tools: "Tools",
  docks: "Docks",
};

const CATEGORY_ORDER: CommandCategory[] = [
  "session",
  "options",
  "status",
  "management",
  "media",
  "tools",
  "docks",
];

function groupCommandsByCategory(
  commands: ChatCommandDefinition[],
): Map<CommandCategory, ChatCommandDefinition[]> {
  const grouped = new Map<CommandCategory, ChatCommandDefinition[]>();
  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }
  for (const command of commands) {
    const category = command.category ?? "tools";
    const list = grouped.get(category) ?? [];
    list.push(command);
    grouped.set(category, list);
  }
  return grouped;
}

export function buildHelpMessage(
  cfg?: OpenClawConfig,
  options?: Pick<CommandsMessageOptions, "surface">,
): string {
  if (isChineseCommandSurface(options?.surface)) {
    const lines = ["ℹ️ 帮助", ""];
    lines.push("会话");
    lines.push("  /new  |  /reset  |  /compact [说明]  |  /stop");
    lines.push("  /archives  |  /use <会话码>  |  /delete <会话码>  |  /current");
    lines.push("");
    const optionParts = [
      "/think <级别|default>",
      "/model <模型>",
      "/fast status|on|off|default",
      "/verbose on|off|full",
      "/trace on|off|raw",
    ];
    if (isCommandFlagEnabled(cfg, "config")) {
      optionParts.push("/config");
    }
    if (isCommandFlagEnabled(cfg, "debug")) {
      optionParts.push("/debug");
    }
    lines.push("选项");
    lines.push(`  ${optionParts.join("  |  ")}`);
    lines.push("");
    lines.push("状态");
    lines.push("  /status  |  /tasks  |  /whoami  |  /context");
    lines.push("");
    lines.push("技能");
    lines.push("  /skill <名称> [输入]");
    lines.push("");
    lines.push("更多：/commands 查看完整命令，/tools 查看可用能力");
    return lines.join("\n");
  }

  const lines = ["ℹ️ Help", ""];

  lines.push("Session");
  lines.push("  /new  |  /reset  |  /compact [instructions]  |  /stop");
  lines.push("");

  const optionParts = [
    "/think <level|default>",
    "/model <id>",
    "/fast status|on|off|default",
    "/verbose on|off|full",
    "/trace on|off|raw",
  ];
  if (isCommandFlagEnabled(cfg, "config")) {
    optionParts.push("/config");
  }
  if (isCommandFlagEnabled(cfg, "debug")) {
    optionParts.push("/debug");
  }
  lines.push("Options");
  lines.push(`  ${optionParts.join("  |  ")}`);
  lines.push("");

  lines.push("Status");
  lines.push("  /status  |  /tasks  |  /whoami  |  /context");
  lines.push("");

  lines.push("Skills");
  lines.push("  /skill <name> [input]");

  lines.push("");
  lines.push("More: /commands for full list, /tools for available capabilities");

  return lines.join("\n");
}

const COMMANDS_PER_PAGE = 8;
const TELEGRAM_HIDDEN_LEGACY_ALIASES = new Set([
  "/tg_archives",
  "/tg_use",
  "/archive_use",
  "/switch_archive",
  "/tg_delete",
  "/archive_delete",
  "/tg_current",
  "/current_tg",
]);

export type CommandsMessageOptions = {
  page?: number;
  surface?: string;
  forcePaginatedList?: boolean;
};

export type CommandsMessageResult = {
  text: string;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
};

function formatCommandEntry(command: ChatCommandDefinition, surface?: string): string {
  const primary = command.nativeName
    ? `/${command.nativeName}`
    : normalizeOptionalString(command.textAliases[0]) || `/${command.key}`;
  const seen = new Set<string>();
  const aliases = command.textAliases
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter(
      (alias) =>
        !isChineseCommandSurface(surface) ||
        !TELEGRAM_HIDDEN_LEGACY_ALIASES.has(normalizeLowercaseStringOrEmpty(alias)),
    )
    .filter(
      (alias) =>
        normalizeLowercaseStringOrEmpty(alias) !== normalizeLowercaseStringOrEmpty(primary),
    )
    .filter((alias) => {
      const key = normalizeLowercaseStringOrEmpty(alias);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  const aliasLabel = aliases.length ? ` (${aliases.join(", ")})` : "";
  const scopeLabel = command.scope === "text" ? " [text]" : "";
  return `${primary}${aliasLabel}${scopeLabel} - ${localizeCommandDescription(command, surface)}`;
}

type CommandsListItem = {
  label: string;
  text: string;
};

function buildCommandItems(
  commands: ChatCommandDefinition[],
  pluginCommands: ReturnType<typeof listPluginCommands>,
  surface?: string,
): CommandsListItem[] {
  const grouped = groupCommandsByCategory(commands);
  const items: CommandsListItem[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryCommands = grouped.get(category) ?? [];
    if (categoryCommands.length === 0) {
      continue;
    }
    const label = localizeCommandCategoryLabel(CATEGORY_LABELS[category], surface);
    for (const command of categoryCommands) {
      items.push({ label, text: formatCommandEntry(command, surface) });
    }
  }

  for (const command of pluginCommands) {
    const pluginLabel = command.pluginId ? ` (${command.pluginId})` : "";
    items.push({
      label: localizeCommandCategoryLabel("Plugins", surface),
      text: `/${command.name}${pluginLabel} - ${command.description}`,
    });
  }

  return items;
}

function formatCommandList(items: CommandsListItem[]): string {
  const lines: string[] = [];
  let currentLabel: string | null = null;

  for (const item of items) {
    if (item.label !== currentLabel) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push(item.label);
      currentLabel = item.label;
    }
    lines.push(`  ${item.text}`);
  }

  return lines.join("\n");
}

export function buildCommandsMessage(
  cfg?: OpenClawConfig,
  skillCommands?: SkillCommandSpec[],
  options?: CommandsMessageOptions,
): string {
  const result = buildCommandsMessagePaginated(cfg, skillCommands, options);
  return result.text;
}

export function buildCommandsMessagePaginated(
  cfg?: OpenClawConfig,
  skillCommands?: SkillCommandSpec[],
  options?: CommandsMessageOptions,
): CommandsMessageResult {
  const page = Math.max(1, options?.page ?? 1);
  const surface = normalizeOptionalLowercaseString(options?.surface);
  const prefersPaginatedList =
    options?.forcePaginatedList === true ||
    Boolean(surface && getChannelPlugin(surface)?.commands?.buildCommandsListChannelData);

  const commands = cfg
    ? listChatCommandsForConfig(cfg, { skillCommands })
    : listChatCommands({ skillCommands });
  const pluginCommands = listPluginCommands();
  const items = buildCommandItems(commands, pluginCommands, surface);

  if (!prefersPaginatedList) {
    const lines = [isChineseCommandSurface(surface) ? "ℹ️ 可用命令" : "ℹ️ Slash commands", ""];
    lines.push(formatCommandList(items));
    lines.push(
      "",
      isChineseCommandSurface(surface)
        ? "更多：/tools 查看可用能力"
        : "More: /tools for available capabilities",
    );
    return {
      text: lines.join("\n").trim(),
      totalPages: 1,
      currentPage: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  const totalCommands = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCommands / COMMANDS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * COMMANDS_PER_PAGE;
  const endIndex = startIndex + COMMANDS_PER_PAGE;
  const pageItems = items.slice(startIndex, endIndex);

  const lines = [
    `${isChineseCommandSurface(surface) ? "ℹ️ 命令" : "ℹ️ Commands"} (${currentPage}/${totalPages})`,
    "",
  ];
  lines.push(formatCommandList(pageItems));

  return {
    text: lines.join("\n").trim(),
    totalPages,
    currentPage,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}
