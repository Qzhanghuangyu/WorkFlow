# [架构必读] Propose（提案与拆解）阶段约束

> **读取必要性：架构必读。**
> 只要涉及「规划一个 change / 决定怎么拆任务」，agent 必须读取本文；
> 它承载了 CustomWorkFlow 最核心的架构取向（见 [Must Read] soul.md 第 4 节）。
> 纯粹实施单个模块或收尾归档时，可不读本文。

## 目标

把一个需求（PRD / Figma）转化为**可被团队并行认领**的任务图。
对应链路：`proposal → specs → design → tasks`。

## 必须遵守的拆解规则

拆解不是把工作列成一张扁平清单，而是要产出一张**带责任人的有向依赖图（DAG）**。

1. **MVVM 第一刀**
   - 一个界面级 change 首先切成两个大任务：**UI 任务**（View）与 **ViewModel 任务**（状态 / 逻辑 / 数据）。
   - 这一刀让「视觉还原」与「逻辑实现」解耦，可由不同专长的人并行推进。

2. **UI 再按模块控件拆**
   - UI 大任务继续拆为独立、可复用、边界清晰的**模块控件**（导航栏、列表项、底部栏、空状态、弹窗……）。
   - 每个控件是一个可独立开发、可独立认领的子任务。
   - **拆出的每个控件必须先查 `[UI控件必读]ui-components.md`**：命中「标准情况」的，按其「指定实现」写进 design.md / tasks.md（并注明参考实现）；命中「需人工裁定的情况」或未命中的，不要擅自定方案，标注出来交用户裁定后再写。

3. **拓扑依赖梳理**
   - 每个任务在 `tasks.md` 中按依赖顺序排列，显式体现前置关系。
   - 契约先行（ViewModel 数据契约）→ 控件并行 → 界面组装 → 联调。
   - 无未完成依赖的任务即「可开始」，相互独立的任务应可同时开工。

## UI 还原度的边界（写进 design 时必须体现）

- AI 只负责**搭建 UI 框架**：布局结构、控件层级、可复用组件、主题基础样式、绑定占位。
- **不追求 100% 像素对齐**；承认约 20% 的视觉差距（间距手感、字体渲染、动效、机型适配、设计师隐性意图）留给人类校准。
- design.md 应说明「哪些部分是 AI 框架、哪些留给人工校准」，避免后续误以为已完全还原。

## 产出物（对应 spec-driven schema）

| Artifact | 作用 | 依赖 |
| --- | --- | --- |
| `proposal.md` | 为什么 / 改什么 / 影响范围 / 能力清单 | — |
| `specs/**/spec.md` | 每个能力的可测试需求（WHEN/THEN） | proposal |
| `design.md` | 实现方案、MVVM 分层、UI 框架边界、关键决策 | proposal |
| `tasks.md` | 拓扑排序的 checkbox 任务清单 | specs, design |

## 对应 skill 与命令

- Skill：`/cwf:propose`（一次性生成全部 artifact）
- 关键命令：`cwf new change "<name>"`、`cwf status --change "<name>" --json`、`cwf instructions <artifact-id> --change "<name>" --json`

## 完成标准

- `applyRequires`（通常为 `tasks`）中的 artifact 全部 `done`。
- `tasks.md` 中每项任务均为 `- [ ] X.Y ...` 格式，且体现拓扑依赖。
- MVVM 两大任务已切分，UI 任务已拆到模块控件粒度。
