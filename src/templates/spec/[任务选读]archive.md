# [任务选读] Archive（归档）阶段约束

> **读取必要性：任务选读。**
> 仅当 agent 要**收尾并归档一个已完成的 change** 时读取本文；
> 规划与实施阶段无需读取。这是流程的最后一环。

## 目标

在 change 的全部任务完成后，把它从活跃工作区移入归档，并把 delta spec 同步进主 spec。
对应链路：`apply → archive`。

## 前置检查（不阻断，但必须提示）

1. **Artifact 完成状态**——`cwf status --change "<name>" --json`，若有 artifact 非 `done`，提示并让用户确认后再继续。
2. **任务完成状态**——读取 `tasks.md`，统计 `- [ ]` / `- [x]`；若有未完成任务，提示并确认。
3. **comate.md 状态**——确认该 change 的 `comate.md` 已标记 `done`；若还有未交接的卡点，先提示。
4. **子 change 收敛**——若这是被拆分出的多个子 change，确认相互依赖的子 change 均已完成或已妥善交接。

> 归档不因警告而中断——只需清晰告知并让用户确认。

## Delta Spec 同步

- 用 status JSON 的 `artifactPaths.specs.existingOutputPaths` 判断是否存在 delta spec。
- 若存在：把每个 delta spec 与主 spec（`cwfspec/specs/<capability>/spec.md`）比较，汇总将应用的新增 / 修改 / 移除 / 重命名，提示后再同步。
- 同步由 agent 驱动（`openspec-sync-specs` 方式）。

## 经验萃取（归档前必做）

一个 change 收尾，是把「本轮反复纠正」沉淀成团队经验的主入口。**在把目录 mv 进 archive 之前**做这一步：

1. **回顾本轮的纠正 / 踩坑**，来源：
   - 各子 change 的 `comate.md` 交接（卡点、返工点）；
   - change 根的 `decisions.md`（若有，跨子 change 的在途决策）；
   - 本次与用户的纠正对话（AI 犯的、被改过的点）。
2. **逐条分类**（三选一）：
   - **一次性 / 情境** → 丢弃，不沉淀（记了是噪音）。
   - **项目事实**（本项目某实现路径 / 接口语义等）→ 记入对应的「本项目参考实现」字段或项目知识处，不进通用规则。
   - **通用规则**（反复出现、跨 change 适用）→ 升级沉淀（见下）。
3. **通用规则按位置路由沉淀**（放对位置才会被回忆）：
   - UI 选型 / 禁用 → `[UI控件必读]` 对应大类明细；
   - 需求分析盲点 → `[分析必读]preflight.md`；
   - 实施规范 → `[模块选读]apply.md`；
   - **跨阶段、不属于以上任何一个** → `[经验必读]lessons.md`。
4. **遵守写入纪律**（见 `[经验必读]lessons.md`「写入纪律」）：蒸馏优先于追加、去重 / 覆盖 / 删除过期、每条写清 Why + How。
5. **规范类须经用户确认再写**——错规则会被 hook 永久注入，比没有更糟。用 AskUserQuestion 让用户确认要沉淀的通用规则条目。
6. change-local 的 `comate.md` / `decisions.md` **随目录一起归档留痕即可**，不必搬进全局;只有蒸馏出的通用规则上升到 `spec/`。

> 无可沉淀时，明确记「本轮无通用经验可沉淀」，不强行造条目。

## 执行归档

- 在 `planningHome.changesDir` 下确保存在 `archive/` 目录。
- 目标名：`YYYY-MM-DD-<change-name>`；若已存在则报错并建议改名或换日期。
- 将 `changeRoot` 整体 `mv` 到归档目录，随目录一并保留 `.openspec.yaml` 与 `comate.md`（协作台账作为历史记录一起归档）。

## 对应 skill 与命令

- Skill：`/cwf:archive`
- 关键命令：`cwf list --json`、`cwf status --change "<name>" --json`

## 完成标准

- change 已移入 `archive/YYYY-MM-DD-<name>/`。
- delta spec 已同步至主 spec（或明确记录「无 delta / 已跳过」）。
- **经验萃取已完成**：本轮通用规则已路由沉淀到对应 spec 文档（经用户确认），或明确记录「无通用经验可沉淀」。
- 归档摘要已展示：变更名、schema、归档位置、同步情况、经验沉淀情况、遗留警告。
