---
name: cwf-propose
description: 在 cwf-preflight 已创建的 change 目录中，一次性生成 proposal、specs、design 和 tasks。适用于用户已完成 preflight，并希望基于 PRD 与 preflight.md 创建完整变更提案时。
allowed-tools: Bash(cwf:*)
license: MIT
compatibility: 需要 cwf CLI。
metadata:
  author: cwf
  version: "1.0"
  generatedBy: "codex"
---

在已有 change 中生成实施所需的全部 artifact。

**输入：** change 名称（lowercase kebab-case），以及 PRD 来源或需求内容。

**步骤**

0. **【强制】确保 spec 约束已在上下文中（不得跳过）**
   - 全局必读：`.customworkflow/spec/[Must Read]soul.md`（回退：`spec/[Must Read]soul.md`）
   - 本阶段必读：`.customworkflow/spec/[架构必读]propose.md`（回退：`spec/[架构必读]propose.md`）
   - UI 控件必读（路由入口）：`.customworkflow/spec/[UI控件必读]ui-components.md`（回退：`spec/[UI控件必读]ui-components.md`）；拆到 UI 控件时，按其大类路由表再读 `ui-components/` 下命中的大类明细
   - **仅当上述约束尚未出现在当前上下文中时才读取**。
   - 未读取并理解约束前，不得创建任何 artifact。

1. **【强制】确认 change 目录存在**

   ```bash
   cwf status --change "<name>" --json
   ```

   - 若命令返回 change 不存在或错误，停止并提示用户先运行 `cwf-preflight`。不得在 propose 中运行 `cwf new change`。
   - 若存在，从 JSON 读取 `changeRoot`、`planningHome`、`artifactPaths` 和 `actionContext`，后续始终使用这些解析路径。
   - 若 `<changeRoot>/preflight.md` 存在，读取它作为需求与代码现状的补充上下文；文件不存在不阻塞 propose。
   - change 目录存在是 propose 唯一的 preflight 前置检查；不要增加额外准备状态门禁，也不要强制清空未明确事项。

2. **若未提供清晰 PRD 输入，询问用户要构建什么**

   使用 **AskUserQuestion 工具**（开放式问题，不提供预设选项）询问：
   > “这个 change 要构建或修复什么？请提供 PRD URL 或完整需求描述。”

   **重要：** 未理解用户希望构建的内容前，不得继续。

3. **获取 artifact 构建顺序**

   使用步骤 1 的 status JSON，并解析：
   - `applyRequires`：实施前所需 artifact ID 数组
   - `artifacts`：全部 artifact 及其状态和依赖项
   - `artifactPaths`：每个 artifact 的已解析路径

4. **按顺序创建 artifact，直至可 apply**

   使用 **TodoWrite 工具**跟踪 artifact 创建进度。

   按依赖顺序循环处理 artifact，优先处理没有待完成依赖项的 artifact：

   a. **对每个状态为 `ready` 的 artifact：**
      - 获取指引：
        ```bash
        cwf instructions <artifact-id> --change "<name>" --json
        ```
      - 读取 `dependencies` 指向的全部已完成 artifact。
      - 使用 `template` 作为结构，遵循 `instruction` 创建内容。
      - 将文件写入 `resolvedOutputPath`。
      - 若指引包含 `context` 或 `rules`，只将其作为写作约束，不得复制进 artifact。
      - 简要展示进度：“已创建 <artifact-id>”。

   b. **持续处理，直至所有 `applyRequires` artifact 完成：**
      - 每创建一个 artifact 后重新运行 `cwf status --change "<name>" --json`。
      - 检查 `applyRequires` 中每个 artifact 的状态是否为 `done`。

   c. **若 artifact 需要用户输入：**
      - 使用 **AskUserQuestion 工具**澄清。
      - 将 `preflight.md` 中仍未明确的事项作为问题来源，但不要因其存在而整体阻塞所有 artifact。

5. **展示最终状态**

   ```bash
   cwf status --change "<name>"
   ```

**输出**

完成后总结：

- 变更名称和位置
- 已创建 artifact 列表及简短说明
- 未明确事项如何被确认、记录为假设或保留为开放问题
- “所有 artifact 已创建，可以开始实施”
- 提示运行 `cwf-apply-change`

**Artifact 创建指南**

- 对每种 artifact 遵循 `cwf instructions` 返回的 `instruction`。
- 创建新 artifact 前读取全部依赖 artifact。
- 使用 `template` 作为输出结构。
- 不得把 `<context>`、`<rules>` 或 `<project_context>` 块复制到 artifact。

**约束**

- propose 只处理已有 change；不得运行 `cwf new change`。
- change 目录存在后，按原 artifact 流程创建 proposal、specs、design 和 tasks。
- 若 `preflight.md` 存在，必须读取，但其未明确事项不构成额外阶段门禁。
- 若同名 change 已包含部分 artifact，基于状态继续，不覆盖已完成内容。
- 写入后验证每个 artifact 文件存在，再继续下一个。
