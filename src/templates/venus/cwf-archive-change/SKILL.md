---
name: cwf-archive-change
description: 在实验性工作流中归档已完成的变更。适用于用户希望在实施完成后完成收尾并归档变更时。
allowed-tools: Bash(cwf:*)
license: MIT
compatibility: 需要 cwf CLI。
metadata:
  author: cwf
  version: "1.0"
  generatedBy: "copied-from-OpenSpec"
---

在实验性工作流中归档已完成的变更。

**路径约束：** 所有 change、artifact 和归档均位于当前目标项目根目录的 `cwfspec/` 下。所有 `cwf` 命令必须在该项目根目录执行，不得写入 CustomWorkFlow 包源码目录、父目录、相邻目录或全局 OpenSpec 安装中的工作区。

**输入：** 可选地指定变更名称。若省略，请判断能否从对话上下文推断；若表述模糊或存在歧义，**必须**提示用户选择可用变更。

**步骤**

0. **【强制】确保 spec 约束已在上下文中（不得跳过）**
   - 全局必读：`.customworkflow/spec/[Must Read]soul.md`（回退：`spec/[Must Read]soul.md`）
   - 本阶段必读：`.customworkflow/spec/[任务选读]archive.md`（回退：`spec/[任务选读]archive.md`）
   - **仅当上述约束尚未出现在当前上下文中时才去读取**（Claude 环境下 PreToolUse hook 通常已自动注入，此时不要重复读取以免浪费上下文）。
   - 未读取并理解上述约束前，**不得**进行后续任何步骤或执行归档。

1. **若未提供变更名称，提示用户选择**

   运行 `cwf list --json` 获取可用变更。使用 **AskUserQuestion 工具**让用户选择。

   仅展示活跃变更（尚未归档的变更）。
   如可获得，请展示每项变更使用的 schema。

   **重要：** 不得猜测或自动选择变更。必须让用户自行选择。

2. **检查 artifact 完成状态**

   运行 `cwf status --change "<name>" --json` 检查 artifact 是否完成。

   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流
   - `planningHome`、`changeRoot`、`artifactPaths` 和 `actionContext`：路径和范围上下文
   - `artifacts`：artifact 列表及其状态（`done` 或其他）

   **若任一 artifact 未处于 `done` 状态：**
   - 显示列出未完成 artifact 的警告
   - 使用 **AskUserQuestion 工具**确认用户希望继续
   - 用户确认后继续

3. **检查任务完成状态**

   读取任务文件（通常为 `tasks.md`），检查是否有未完成任务。

   统计标记为 `- [ ]`（未完成）与 `- [x]`（已完成）的任务数量。

   **若发现未完成任务：**
   - 显示未完成任务数量的警告
   - 使用 **AskUserQuestion 工具**确认用户希望继续
   - 用户确认后继续

   **若不存在任务文件：** 无需显示任务相关警告，直接继续。

4. **评估 delta spec 同步状态**

   使用 status JSON 中的 `artifactPaths.specs.existingOutputPaths` 检查是否存在 delta spec。若不存在，则无需同步提示，直接继续。

   **若存在 delta spec：**
   - 将每个 delta spec 与对应的主 spec（`openspec/specs/<capability>/spec.md`）比较
   - 确定将应用的变更（新增、修改、移除、重命名）
   - 提示用户前展示汇总摘要

   **提示选项：**
   - 若需要变更：“立即同步（推荐）”、“不进行同步直接归档”
   - 若已同步：“立即归档”、“仍然同步”、“取消”

   若用户选择同步，使用 Task 工具（subagent_type: `"general-purpose"`，prompt：`"使用 Skill 工具为变更 '<name>' 调用 openspec-sync-specs。Delta spec 分析：<包含已分析的 delta spec 摘要>"`）。无论选择如何，均继续执行归档。

5. **经验萃取（归档前必做）**

   在把目录移入 archive **之前**，按 `[任务选读]archive.md`「经验萃取」小节沉淀本轮经验：
   - 回顾来源：各子 change 的 `comate.md` 交接、change 根 `decisions.md`（若有）、本次与用户的纠正对话。
   - 逐条分类：一次性（丢弃）/ 项目事实（记入参考实现或项目知识）/ 通用规则（升级）。
   - 通用规则按位置路由沉淀：UI 选型→`[UI控件必读]`对应大类；分析盲点→`[分析必读]preflight.md`；实施规范→`[模块选读]apply.md`；跨切面→`[经验必读]lessons.md`。
   - 遵守写入纪律（蒸馏优先于追加、去重/覆盖/删除、Why+How）；**规范类用 AskUserQuestion 让用户确认后再写**。
   - 无可沉淀时，记「本轮无通用经验可沉淀」，不强行造条目。

6. **执行归档**

   若不存在，在 `planningHome.changesDir` 下创建 `archive` 目录：
   ```bash
   mkdir -p "<planningHome.changesDir>/archive"
   ```

   使用当前日期生成目标名称：`YYYY-MM-DD-<change-name>`

   **检查目标是否已存在：**
   - 若存在：报错并建议重命名已有归档或使用不同日期
   - 若不存在：将 `changeRoot` 移至归档目录

   ```bash
   mv "<changeRoot>" "<planningHome.changesDir>/archive/YYYY-MM-DD-<name>"
   ```

7. **展示摘要**

   展示归档完成摘要，包括：
   - 变更名称
   - 使用的 schema
   - 归档位置
   - spec 是否已同步（如适用）
   - 经验沉淀情况（沉淀了哪些通用规则到哪个文档，或「无可沉淀」）
   - 任何警告的说明（未完成的 artifact/任务）

**成功时的输出**

```
## 归档完成

**变更：** <change-name>
**Schema：** <schema-name>
**已归档至：** 根据 `planningHome.changesDir`/YYYY-MM-DD-<name>/ 得出的归档路径
**Specs：** ✓ 已同步至主 spec（或“无 delta spec”或“已跳过同步”）

全部 artifact 已完成。全部任务已完成。
```

**约束**
- 归档前必须完成「经验萃取」（见 `[任务选读]archive.md`）；规范类经验须经用户确认后才写入 `spec/`，无可沉淀时明确记录
- 未提供变更时，始终提示用户选择
- 使用 artifact 图（`cwf status --json`）检查完成状态
- 不要因警告而阻止归档——只需告知并确认
- 移动到归档时保留 `.openspec.yaml`（它将随目录一起移动）
- 清晰总结执行结果
- 若请求同步，使用 openspec-sync-specs 方式（由 agent 驱动）
- 若存在 delta spec，始终执行同步评估并在提示前展示汇总摘要
