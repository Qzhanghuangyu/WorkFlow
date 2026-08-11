---
name: cwf-apply-change
description: 实施 OpenSpec 变更中的任务。适用于用户希望开始实施、继续实施或逐项完成任务时。
allowed-tools: Bash(cwf:*)
license: MIT
compatibility: 需要 cwf CLI。
metadata:
  author: cwf
  version: "1.0"
  generatedBy: "copied-from-OpenSpec"
---

实施 OpenSpec 变更中的任务。

**路径约束：** 所有 change、artifact 和归档均位于当前目标项目根目录的 `cwfspec/` 下。所有 `cwf` 命令必须在该项目根目录执行，不得写入 CustomWorkFlow 包源码目录、父目录、相邻目录或全局 OpenSpec 安装中的工作区。

**输入：** 可选地指定变更名称。若省略，请判断能否从对话上下文推断；若表述模糊或存在歧义，**必须**提示用户选择可用变更。

**步骤**

0. **【强制】确保 spec 约束已在上下文中（不得跳过）**
   - 全局必读：`.customworkflow/spec/[Must Read]soul.md`（回退：`spec/[Must Read]soul.md`）
   - 本阶段必读：`.customworkflow/spec/[模块选读]apply.md`（回退：`spec/[模块选读]apply.md`）
   - UI 控件必读：`.customworkflow/spec/[UI控件必读]ui-components.md`（回退：`spec/[UI控件必读]ui-components.md`）
   - **仅当上述约束尚未出现在当前上下文中时才去读取**（Claude 环境下 PreToolUse hook 通常已自动注入，此时不要重复读取以免浪费上下文）。
   - 未读取并理解上述约束前，**不得**进行后续任何步骤或实施任务。

1. **选择变更**

   如果提供了名称，直接使用。否则：
   - 如果用户提到某项变更，则从对话上下文推断
   - 若只有一项活跃变更，自动选择它
   - 若存在歧义，运行 `cwf list --json` 获取可用变更，并使用 **AskUserQuestion 工具**让用户选择

   始终说明：“使用变更：<name>”，并告知如何覆盖选择（例如 `/opsx:apply <other>`）。

2. **检查状态以了解 schema**
   ```bash
   cwf status --change "<name>" --json
   ```
   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流（例如 `"spec-driven"`）
   - `planningHome`、`changeRoot` 和 `actionContext`：规划范围和编辑约束
   - 哪个 artifact 包含任务（对于 spec-driven 通常为 `"tasks"`；其他 schema 需检查状态）

3. **获取 apply 指引**

   ```bash
   cwf instructions apply --change "<name>" --json
   ```

   该命令返回：
   - `contextFiles`：artifact ID → 具体文件路径数组（依 schema 而异，可能是 proposal/specs/design/tasks 或 spec/tests/implementation/docs）
   - 进度（总数、已完成、剩余）
   - 带状态的任务列表
   - 基于当前状态的动态指引

   **处理状态：**
   - 若 `state: "blocked"`（缺少 artifact）：显示提示，并建议使用 cwf-continue-change
   - 若 `state: "all_done"`：告知用户已完成，并建议归档
   - 否则：继续实施

4. **读取上下文文件**

   读取 apply 指引输出中 `contextFiles` 列出的每个文件路径。
   文件取决于正在使用的 schema：
   - **spec-driven**：proposal、specs、design、tasks
   - 其他 schema：遵循 CLI 输出中的 contextFiles

5. **展示当前进度**

   展示：
   - 正在使用的 schema
   - 进度：“已完成 N/M 项任务”
   - 剩余任务概览
   - CLI 的动态指引

6. **实施任务（循环直至完成或受阻）**

   对每个待处理任务：
   - 展示当前正在处理的任务
   - 完成所需代码变更
   - 保持变更最小且聚焦
   - 在 tasks 文件中将任务标记为已完成：`- [ ]` → `- [x]`
   - 继续下一个任务

   **以下情况暂停：**
   - 任务不明确 → 请求澄清
   - 实施暴露设计问题 → 建议更新 artifact
   - 遇到错误或阻塞 → 报告并等待指引
   - 用户中断

7. **完成或暂停时展示状态**

   展示：
   - 本次会话完成的任务
   - 总体进度：“已完成 N/M 项任务”
   - 若全部完成：建议归档
   - 若已暂停：说明原因并等待指引

**实施过程中的输出**

```
## 正在实施：<change-name>（schema：<schema-name>）

正在处理任务 3/7：<任务描述>
[...正在实施...]
✓ 任务完成

正在处理任务 4/7：<任务描述>
[...正在实施...]
✓ 任务完成
```

**完成时的输出**

```
## 实施完成

**变更：** <change-name>
**Schema：** <schema-name>
**进度：** 已完成 7/7 项任务 ✓

### 本次会话已完成
- [x] 任务 1
- [x] 任务 2
...

所有任务已完成！可以归档此变更。
```

**暂停时的输出（遇到问题）**

```
## 实施已暂停

**变更：** <change-name>
**Schema：** <schema-name>
**进度：** 已完成 4/7 项任务

### 遇到的问题
<问题描述>

**选项：**
1. <选项 1>
2. <选项 2>
3. 其他方案

你希望如何处理？
```

**约束**
- 持续处理任务，直至完成或受阻
- 开始前始终读取上下文文件（来自 apply 指引输出）
- 如果任务存在歧义，实施前暂停并询问
- 如果实施暴露问题，暂停并建议更新 artifact
- 保持代码变更最小，并限定在每项任务的范围内
- 每完成一项任务后立即更新其复选框
- 遇到错误、阻塞或需求不清时暂停——不要猜测
- 使用 CLI 输出中的 contextFiles，不要假定具体文件名

**流式工作流集成**

此 skill 支持“对变更执行操作”的模式：

- **可随时调用**：在所有 artifact 完成前（若任务已存在）、部分实施后，或与其他操作交错时均可调用
- **允许更新 artifact**：若实施暴露设计问题，建议更新 artifact——不受阶段锁定，可灵活推进
