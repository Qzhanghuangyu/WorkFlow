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
- 归档摘要已展示：变更名、schema、归档位置、同步情况、遗留警告。
