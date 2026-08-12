---
name: cwf-preflight
description: 在 cwf-propose 前读取 PRD、创建 change，并把 PRD 中未明确的状态交互、边界异常和代码兼容性事项记录到 change 目录的 preflight.md。适用于用户开始一项新需求、希望先确认当前实现状态并留下需求分析记录时。
---

# CWF Preflight

在 propose 前创建 change，并完成一次轻量的实现状态检查。此阶段不解决全部需求问题，只把 PRD 未明确事项如实记录到 `preflight.md`，供后续 propose 使用。

## 输入

需要：

- change 名称，使用 lowercase kebab-case
- PRD URL、本地文件、粘贴内容或完整需求描述

若缺少其中一项，先向用户索取；未获得必要输入前不要创建 change。

## 步骤

### 0. 加载约束

- 若尚未在上下文中，读取 `.customworkflow/spec/[Must Read]soul.md` 和 `.customworkflow/spec/[分析必读]preflight.md`。
- 对应文件不存在时，回退到 `spec/[Must Read]soul.md` 和 `spec/[分析必读]preflight.md`。
- 按需读取 `.customworkflow/spec/` 下与当前需求相关的项目约束。

### 1. 读取 PRD 与设计稿

- 使用当前环境可用的文档能力读取完整 PRD，不要只依据标题或摘要。
- **若输入包含 Figma / 设计稿链接（`figma.com/file`、`figma.com/design`、`figma.com/proto` 等），必须先调用 `figma-use` skill，通过 Figma MCP 读取真实结构化设计数据（图层结构、文本、尺寸间距、颜色、组件与变量等）**，再与 PRD 综合分析。见 `[分析必读]preflight.md` 第 1.1 节。
  - **严禁仅凭截图、缩略图或链接预览图判断设计内容。**
  - Figma MCP 未授权 / 不可用时，先按 skill 指引完成授权；仍不可用则停止并请用户提供可读取的设计数据，不要退回到截图猜测。
- 提取需求目标、功能范围、主要交互、数据、接口和验收描述。
- 区分 PRD 明确内容与推断；不要用常识补写产品决定。
- 若 PRD 或设计稿无法访问，停止并请求用户提供可读取内容。

### 2. 创建 change

确认当前工作目录是正在分析的目标项目根目录。后续 `cwf status`、`cwf new change`、`cwf instructions` 等命令必须始终在该项目根目录执行。

先运行以下命令确认同名 change 是否已经存在：

```bash
cwf status --change "<name>" --json
```

若已存在且能够确认属于当前需求，复用 JSON 中的 `changeRoot`；若无法确认，询问用户是继续现有 change 还是更换名称。

不存在时运行：

```bash
cwf new change "<name>" --json
```

从 JSON 的 `change.path` 获取 change 目录。不要自行猜测 `openspec/` 或 `cwfspec/` 路径，也不要在父目录中搜索其他 OpenSpec 工作区。

### 3. 写入待澄清事项

- 根据 `[分析必读]preflight.md` 约束分析 PRD，将分析结论写入 change 目录的 `preflight.md`。
- 写入完成后，验证 `<changeRoot>/preflight.md` 存在且可读取。

### 4. 输出摘要

确认 `preflight.md` 写入成功后，展示：

- change 名称和目录
- `preflight.md` 路径
- 根据 `[分析必读]preflight.md` 约束分析的摘要
- 下一步可以运行 `cwf-propose`

## 约束

- `cwf new change` 只在 preflight 阶段执行。
- 必须创建 `preflight.md`，即使未明确事项均为“无”。
- 此阶段只确认功能实现状态并记录未明确事项，不创建 proposal、specs、design 或 tasks。
- 不修改业务代码，不把推断写成事实。
- 需求含 Figma / 设计稿链接时，必须用 `figma-use` skill 经 Figma MCP 读取真实设计数据，严禁仅凭截图判断，并与 PRD 综合分析。
