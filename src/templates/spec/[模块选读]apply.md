# [模块选读] Apply（实施与协作分派）阶段约束

> **读取必要性：模块选读。**
> 当 agent 要**实施某个（子）change / 模块控件**时读取本文；
> 只做整体规划或最终归档时可不读。它是 CustomWorkFlow 团队协作模型的落地说明。

## 目标

把规划好的 change 变成代码，并且以**可分派、可追踪责任人**的方式推进。
对应链路：`tasks → apply`。

## CustomWorkFlow 相对 OpenSpec 的关键扩展：一个 change 拆成多个 change

进入 apply 阶段时，**不要**让单个执行者吞下整个 change。按 propose 阶段的拆解结果，把一个 change 拆成**多个可独立实施的子 change**：

- 每个子 change 对应一块可交付工作：一个 ViewModel、一组模块控件、一次界面组装等。
- 子 change 之间遵守 propose 阶段梳理的**拓扑依赖**：无未完成依赖者可立即开工。
- 不同子 change 可分派给不同的人 / agent **并行 apply**。

## comate.md：协作与责任台账（必须维护）

每个（子）change 目录下维护一份 **`comate.md`**，让协作从口头约定变成文件事实：

```markdown
# comate

- 负责人 (owner): <name>
- 状态 (status): todo | in-progress | blocked | done
- 依赖 (depends-on): [<change-a>, <change-b>]
- 被依赖 (blocks): [<change-c>]
- 交接 (handoff): <当前进度、卡点、下一步谁接>
```

规则：
- 认领子 change 时先在 `comate.md` 写上 owner。
- 状态变化、遇到阻塞、需要交接时，及时更新 `comate.md`。
- 依赖 / 被依赖字段必须与 propose 阶段的拓扑关系一致。

## 并行窗口同步（多人 / 多 agent 同时做一个 change）

一个 change 常被拆成多个子 change，分给**不同窗口（会话 / 人 / agent）并行 apply**。**文档即记忆，窗口之间靠 change 目录文件 + git 同步——没有跨会话的实时推送。**

> ⚠️ **git 操作（pull / commit / push）不自动执行，须人工完成或用户确认**（见 [Must Read] soul.md 全局约束）。agent 只负责**写文件**和**提示需要同步**，把 git 动作交给人。

因此必须守住：

1. **认领前先同步**：认领某子 change 前，**提示用户先 `git pull`**（由用户执行或确认）；拉到最新后再读该 change 的 `comate.md` 与 change 根 `decisions.md`（若有），了解已定决策与卡点，避免撞车 / 重复决策。
2. **决策即落盘**：做出**影响其他子 change 的关键决策**、或**被用户纠正的点**时——把它写进本子 change 的 `comate.md` 交接；**跨子 change 的共享决策**写进 change 根 `decisions.md`（见下）。写文件可直接做；写完后**提示用户「这些改动需要提交同步」**，由用户 commit / push，不要自动执行。
3. **阶段边界重读**：完成一个子任务、接下一个前，重读 `comate.md` / `decisions.md`——**已在运行的会话，其上下文是开工时冻结的，不会自动刷新**，靠重读才能拿到隔壁窗口的新决策（重读前可提示用户 pull 以拿到远端最新）。
4. **归档时上升**：这些 change-local 决策里，能升级成通用规则的，在归档「经验萃取」时提炼进 `spec/`（见 `[任务选读]archive.md`）；其余随目录归档留痕。

### change 根 `decisions.md`（可选，跨子 change 共享决策台账）

当多个子 change 需要共享同一决策时，在 change 根维护一份 **append-only** 的 `decisions.md`（append 减少并行写冲突）：

```markdown
## <日期> <决策一句话>

- 决策：<定了什么>
- Why：<为什么>
- 影响：<涉及哪些子 change>
- 决定人：<owner>
```

## 实施规则

- 开始前读取 apply 指引输出中 `contextFiles` 列出的文件（proposal / specs / design / tasks），不要假定文件名。
- 逐项完成 `tasks.md` 中的任务，完成一项立即把 `- [ ]` 改为 `- [x]`。
- 保持每次改动最小且聚焦于当前任务。
- **实施 UI 控件前先查 `[UI控件必读]ui-components.md`（路由入口）→ 按大类路由表读 `ui-components/` 下对应大类明细；命中的控件必须按其「指定实现」与「官方标准用法」落地**（例如 tab 用 MagicIndicator，不得改用 TabLayout 或手撸）；项目中已有同类实现的，照其结构落地。若命中「需人工裁定的情况」，暂停并交用户裁定，不要自行发挥。
- UI 实施只搭框架、不死磕像素级对齐（见 [Must Read] soul.md 信条一）；把无法自动对齐的部分在 `comate.md` 的交接里标注给人工。

## 何时暂停

- 任务不明确 → 请求澄清。
- 实施暴露设计问题 → 建议更新 artifact（apply 不锁阶段，可回改）。
- 遇到错误 / 阻塞 → 更新 `comate.md` 状态为 `blocked` 并报告。

## 对应 skill 与命令

- Skill：`/cwf:apply`
- 关键命令：`cwf status --change "<name>" --json`、`cwf instructions apply --change "<name>" --json`、`cwf list --json`

## 完成标准

- 子 change 的 `tasks.md` 全部 `- [x]`。
- `comate.md` 状态更新为 `done`，交接信息完整。
- 下游依赖它的子 change 可以据此开工。
