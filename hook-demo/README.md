# hook-demo — 手动复现 Codex hook 验证

这里是「验证结论」里三个测试样例的独立、可复跑版本。你可以逐个跑，看清
CustomWorkFlow 的 spec 约束是怎么通过 hook 进到 Codex 上下文的。

## 前置

- 已安装 `codex` CLI（本验证基于 `codex-cli 0.144.1`）。
- `node` 可用。
- **重要**：三个脚本都用了 `--dangerously-bypass-hook-trust`。Codex 默认不信任
  仓库里的 hook，正常使用首次会要求你确认信任；这个 flag 只是为了让脚本能一次跑通，
  方便你观察。真实安装给用户时，用户需要手动信任一次该 hook。

每个脚本跑完不会污染你的环境；Rig 3 会在 `03-e2e-install/installed-project/`
生成一个临时安装目录（已被 .gitignore 忽略）。

---

## Rig 1 — PreToolUse 会不会触发？skill 调用长什么样？

```bash
bash 01-codex-pretooluse/run.sh
```

**看什么：**
- `01-codex-pretooluse/.codex/config.toml`：一个 `matcher = ".*"` 的 PreToolUse hook，
  匹配「所有」工具调用。
- `.codex/hooks/log-hook.mjs`：把每次收到的 payload 追加写进 `hook.log`。
- 跑完后打印的 `hook.log`：注意每条 payload 里的 **`tool_name`**。

**预期结论：**
- Test A（跑 shell 命令）→ hook 触发，`tool_name` 是 `Bash`。
- Test B（"use the rig-echo skill"）→ hook 也触发，但 `tool_name` **仍是 `Bash`**，
  命令是 `sed -n ... rig-echo/SKILL.md` —— 即 Codex「用 skill」其实是用 Bash 读
  那个 markdown 文件。**Codex 里没有 `Skill` 工具**，所以 Claude 那种
  `matcher: "Skill"` 的精准拦截在 Codex 行不通。这正是我们改用 SessionStart 的原因。

---

## Rig 2 — SessionStart 注入的内容真的进模型了吗？

```bash
bash 02-codex-sessionstart/run.sh
```

**看什么：**
- `.codex/hooks/ss-hook.mjs`：在 SessionStart 注入一句「暗号是 ZEBRA_MARKER_98765」。
  这个暗号**只存在于 hook 里**，不在任何文件、不在 prompt 里。
- 脚本问模型："What is the secret word?"

**预期结论：**
- `ss.log` 出现一次 SessionStart payload（`source: "startup"`，一会话一次）。
- 模型回答 `ZEBRA_MARKER_98765` → 证明 `additionalContext` 确实进了模型上下文。

---

## Rig 3 — 端到端：真安装 + 真跑

```bash
bash 03-e2e-install/run.sh
```

**看什么：**
- 用真正的 `customworkflow install` 把 skills / spec / hook 装进一个新项目
  （`installed-project/`）。
- 打印装好的 `.codex/config.toml`、`.codex/hooks/`、`.customworkflow/spec/`。
- 然后在**安装好的项目里**跑 codex，问一个只在 `soul.md` 里的事实
  （「Figma→安卓大约百分之几无法自动对齐」），并**明确禁止读文件**。

**预期结论：**
- 模型回答 `20%` → 证明整条链路成立：
  `cwf install` → 写 `.codex/config.toml` 注册 hook → `cwf-spec-session.mjs`
  → soul.md 注入会话上下文（模型没读任何文件也知道答案）。

---

## 涉及的真实代码（不是 demo 专用，是线上代码）

- Hook 脚本模板：
  - `../src/templates/hooks/cwf-spec-guard.mjs`（Claude PreToolUse，按 skill 注入）
  - `../src/templates/hooks/cwf-spec-session.mjs`（Codex SessionStart，注入 soul.md）
- 安装逻辑：`../src/init.js`
  - `installClaudeSpecHook()` / `installCodexSpecHook()` / `installSpecDocs()`
- 约束文档源：`../spec/`（安装时拷到目标项目 `.customworkflow/spec/`）

> Rig 1/2 用的是**独立的简化 hook**（只为演示机制）；Rig 3 用的是**仓库里真正会
> 发布的代码**。三者结合，能完整看清「机制能不能用」+「我们的代码有没有正确用上它」。
