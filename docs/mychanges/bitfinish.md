# Bit Finish

## 已完成

- OpenClaw 配置已按上下文调整：`skills.allowBundled`、`plugins.allow`、`canvas` 宿主、`tavily`、`web.search.provider=brave`、`skills.install.nodeManager=npm` 等都已经动过。
- 机器侧已补进部分依赖：`gh`、`rg`、`ffmpeg`、`clawhub`、`mcporter` 已装到可执行路径里。
- `config-audit.jsonl` 已补过一条配置写入记录。

## 完成了一半

- `github` 技能的 Linux 安装链路：`SKILL.md` 里已经补了 `apt` 分支，代码里也开始接 `apt`，但相关测试和收尾还没补完。
- `clawhub` / `mcporter` 可用性：二进制已装好，但 `mcporter` 在当前 Node 版本下有 engine 警告，后续最好换到更高 Node 再确认。
- 配置健康状态与当前配置的对齐：还没补写到最终一致状态。

## 还没开始

- 其余缺失技能的完整补齐和逐项验证。
- `nano-pdf` 的安装链路。
- `summarize` 在 Linux 下的前置条件处理。
- 任何源码变更对应的 changelog / 配置日志收尾。

## 当前状态

OpenClaw 现在不是“全绿”，而是“核心路径已部分打通，剩余缺口集中在少数技能前置条件、安装兼容性和收尾记录”。当前最明显的缺口是：部分技能还缺命令行依赖或运行环境，`github` 的 Linux 安装支持也还没完全收尾。
