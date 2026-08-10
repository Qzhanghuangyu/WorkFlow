# cwf-spec-guard hook 详解

> 本文详细说明 `src/templates/hooks/cwf-spec-guard.mjs` 这个 PreToolUse hook 的
> 作用、运行机制，以及文件中每个常量 / 方法的用途。
>
> 对应源码：`src/templates/hooks/cwf-spec-guard.mjs`（install 时会被铺到目标项目的
> `.claude/hooks/cwf-spec-guard.mjs`）。

---

## 一、PreToolUse 是什么

`PreToolUse` 是 Claude Code 的一种 **hook（钩子）时机**。

Claude Code 在执行**任何工具（Tool）之前**，会先触发注册在 `PreToolUse` 上的脚本，
把「即将调用哪个工具、参数是什么」以 JSON 的形式通过 **stdin** 管道喂给脚本。脚本
可以据此决定：放行、往上下文里追加内容、或阻断这次调用。

### 注册方式

hook 通过目标项目的 `.claude/settings.json` 注册（installer 会自动写入并去重）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/cwf-spec-guard.mjs\""
          }
        ]
      }
    ]
  }
}
```

- `matcher: "Skill"`：只在即将调用 **Skill 工具**时触发，其它工具（Read/Bash/Edit…）不触发。
- `command`：触发时执行的命令，即用 node 跑本 hook 脚本。
- `$CLAUDE_PROJECT_DIR`：Claude Code 注入的环境变量，指向当前项目根目录。

### PreToolUse 的四种能力（本 hook 用到的）

| 能力 | 本 hook 如何使用 |
|------|------------------|
| **拦截时机** | 抢在 skill 真正执行前运行，先把约束准备好 |
| **匹配过滤** | `matcher: "Skill"` 只管 skill 调用；脚本内再用 `SKILL_SPECS` 二次过滤，只认 cwf-* 工作流 skill |
| **注入上下文** | 通过 stdout 返回 `hookSpecificOutput.additionalContext`，把约束文档塞进模型上下文 |
| **放行 / 不阻断** | 脚本始终 `exit(0)` 放行；本 hook 从不阻断，只做"增强" |

### 它在本工作流里的作用（一句话）

> 每次 Claude 要调用一个 cwf-* 工作流 skill 之前，本 hook 自动把该阶段对应的
> **架构约束文档**注入上下文，保证 skill **永远不会在缺少约束的情况下运行**。

这就是它叫 **guard（守卫）** 的原因：靠 harness 层的**硬拦截**保证约束到位，
而不是依赖模型"自觉记得去读文档"。Skill 的 description 触发和"记得读约束"都依赖
模型判断，不稳定；hook 只要匹配就一定执行，确定性最高。

---

## 二、整体数据流

```
Claude 准备调用某个 skill
        │
        ▼
Claude Code 触发 PreToolUse（matcher=Skill）
        │  以 JSON 从 stdin 传入：{ tool_input:{name}, session_id, cwd, ... }
        ▼
┌─────────────────  cwf-spec-guard.mjs  ─────────────────┐
│ 1. readStdin()          读取 JSON payload               │
│ 2. JSON.parse           解析（坏了→放行退出）           │
│ 3. extractSkillName()   取出 skill 名                   │
│ 4. 查 SKILL_SPECS       不在表里（非 cwf skill）→放行   │
│ 5. 定位 projectDir      优先 CLAUDE_PROJECT_DIR         │
│ 6. readInjected()       读本会话"已注入"集合            │
│ 7. 过滤 pending         去掉本会话已注入过的文件        │
│                         全注入过 → 退出                 │
│ 8. loadSpec() 逐个读    从 .customworkflow/spec 读文档  │
│ 9. 拼接 additionalContext                               │
│ 10. stdout 输出注入     （+ stderr 兼容提示）           │
│ 11. writeInjected()     记录本次已注入，供去重          │
│ 12. exit(0)             放行                            │
└────────────────────────────────────────────────────────┘
        │
        ▼
skill 带着已注入的约束文档执行
```

---

## 三、逐个常量 / 方法详解

### `SKILL_SPECS`（常量，L19-24）

```js
const SKILL_SPECS = {
  'cwf-preflight':     ['[Must Read]soul.md', '[分析必读]preflight.md'],
  'cwf-propose':       ['[Must Read]soul.md', '[架构必读]propose.md'],
  'cwf-apply-change':  ['[Must Read]soul.md', '[模块选读]apply.md'],
  'cwf-archive-change':['[Must Read]soul.md', '[任务选读]archive.md'],
};
```

**核心路由表**：`skill 名 → 该 skill 必须注入哪些 spec 文件`。

- 是整个 hook 的"决策依据"：只有 key 在这里出现的 skill 才会触发注入，其它一律放行。
- 每个 skill 都带 `[Must Read]soul.md`（全局必读），再加各自阶段的专属约束。
- 文件名是相对 spec 目录的路径。
- **硬约束**：这里的 key 必须与 `src/templates/venus/` 下的 skill 目录名、以及各
  `SKILL.md` frontmatter 的 `name` 完全一致，否则注入不生效。

> 定制工作流时，往往就是改这张表 + 改 `src/templates/spec/` 里的文档。

---

### `readStdin()`（L26-37）

```js
function readStdin() { ... }
```

**读取 Claude Code 从 stdin 管道传入的 JSON payload**（即"即将调用的工具信息"）。

- 用 Promise 包裹 stdin 的异步 `data`/`end` 事件，逐块拼接后 resolve 完整字符串。
- `if (process.stdin.isTTY) resolve('')`：保护逻辑——当脚本不是被管道调用（比如手动
  在终端直接运行）时，stdin 不会有数据也不会触发 `end`，这行确保不会永远挂起。

---

### `extractSkillName(payload)`（L39-51）

```js
function extractSkillName(payload) {
  const input = payload?.tool_input ?? payload?.toolInput ?? {};
  return (input.name ?? input.skill ?? input.skillName ?? input.command ?? '')
    .toString().trim();
}
```

**从 payload 里抠出"本次要调用的 skill 名字"**。

- 用 `??` 链依次尝试多个可能的字段名（`name`/`skill`/`skillName`/`command`），
  **容忍 Claude Code 不同版本的 payload 结构差异**——某个版本字段叫什么都能取到。
- `payload?.tool_input ?? payload?.toolInput`：同时兼容 snake_case 和 camelCase。
- `.toString().trim()`：归一化成干净字符串，取不到就返回空串。

---

### `specDirs(projectDir)`（L53-59）

```js
function specDirs(projectDir) {
  return [
    path.join(projectDir, '.customworkflow', 'spec'),
    path.join(projectDir, 'spec'),
  ];
}
```

**返回候选的约束文档目录列表**，按优先级排序（越靠前越优先）。

- 优先 `.customworkflow/spec`（installer 铺进目标项目的正式位置）。
- 退而求其次 `spec`（源码项目自带的一份，或其它布局）。
- **硬约束**：`.customworkflow/spec` 必须与 `src/init.js` 的 `SPEC_INSTALL_DIR`
  保持一致，否则铺进去的文档 hook 读不到（这是最容易犯的错）。

---

### `loadSpec(projectDir, relativeFile)`（L61-72）

```js
async function loadSpec(projectDir, relativeFile) { ... }
```

**在候选目录里找到并读出某一份约束文档**。

- 按 `specDirs()` 的顺序逐个目录尝试拼路径并 `readFile`。
- 读到就立即返回 `{ path, content }`；读不到（catch）就试下一个目录。
- 全部目录都失败则返回 `null`（交给上层记为 missing）。

---

### 会话去重三兄弟

这三个方法合起来实现**每会话去重**：`soul.md` 这类被多个 skill 共享的文档，在同一
个会话里只注入一次，避免重复占用上下文窗口。

#### `sessionMarkerPath(sessionId)`（L79-83）

```js
function sessionMarkerPath(sessionId) {
  if (!sessionId) return null;
  const safeId = sessionId.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(os.tmpdir(), 'cwf-spec-guard', `${safeId}.json`);
}
```

**算出本会话的去重标记文件路径**，形如 `/tmp/cwf-spec-guard/<sessionId>.json`。

- `safeId`：把 sessionId 里的非法文件名字符替换成 `_`，防路径注入 / 非法字符。
- 没有 sessionId 时返回 `null` → 上层退化为"不去重"（每次都注入，功能不受影响）。
- **硬约束**：`cwf-spec-guard` 这个目录名要与其它工作流（如原 falla）区分开，
  避免两套在 /tmp 下的标记互相串扰。

#### `readInjected(markerPath)`（L85-93）

```js
async function readInjected(markerPath) { ... }  // 返回 Set
```

**读出"本会话已经注入过哪些 spec 文件"**，返回一个 Set。

- 读标记文件 → JSON 解析 → 转成 Set。
- 文件不存在 / 内容损坏 / 不是数组，一律返回**空 Set**（相当于"还没注入过任何东西"）。

#### `writeInjected(markerPath, injectedSet)`（L95-103）

```js
async function writeInjected(markerPath, injectedSet) { ... }
```

**把"已注入集合"写回标记文件**，供本会话后续调用去重。

- 先 `mkdir(..., { recursive: true })` 确保目录存在，再写 JSON。
- **best-effort**：任何写入失败都被 catch 吞掉，不报错、不阻断——去重只是优化，
  绝不能因为它出问题而挡住工具执行。

---

### `main()`（L105-188）

主流程，把上面所有部件串起来。逐步拆解：

```js
const raw = await readStdin();          // 1. 读 stdin
try { payload = raw ? JSON.parse(raw) : {}; }
catch { process.exit(0); }              // 2. 解析；payload 坏了→放行退出
```

```js
const skillName = extractSkillName(payload);
const specFiles = SKILL_SPECS[skillName];
if (!specFiles) process.exit(0);        // 3-4. 取 skill 名，查表；
                                        //      非 cwf 工作流 skill → 放行退出
```

```js
const projectDir =
  process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
                                        // 5. 定位项目根：优先环境变量，
                                        //    再 payload.cwd，最后当前目录
```

```js
const sessionId = payload?.session_id ?? payload?.sessionId ?? '';
const markerPath = sessionMarkerPath(sessionId);
const injected = await readInjected(markerPath);
const pending = specFiles.filter((r) => !injected.has(r));
if (pending.length === 0) process.exit(0);
                                        // 6-7. 读已注入集合，过滤出本次还没注入的；
                                        //      全注入过 → 无事可做，退出
```

```js
for (const relative of pending) {
  const loaded = await loadSpec(projectDir, relative);
  if (loaded) { sections.push(...); loadedFiles.push(relative); }
  else { missing.push(relative); }      // 8. 逐个读文档；读到的进 sections，
}                                        //    读不到的记 missing
```

```js
const header = `【CustomWorkFlow spec 约束 — 使用 ${skillName} 前必须遵守】\n...`;
const missingNote = missing.length ? `（提示：未找到...${missing.join('、')}）` : '';
const additionalContext = sections.length > 0
  ? `${header}\n\n${sections.join('\n\n')}${missingNote}`
  : `${header}${missingNote}`;          // 9. 拼接：中文 header + 各文档正文 + 缺失提示
```

```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext },
}));                                     // 10. 主注入路径：stdout 输出 additionalContext
                                        //     （新版 Claude Code 读这个字段进上下文）
process.stderr.write(`[CustomWorkFlow] ${skillName} 前请阅读 ...\n`);
                                        //     兼容路径：老版本从 stderr 显示提示
```

```js
if (loadedFiles.length > 0) {
  for (const r of loadedFiles) injected.add(r);
  await writeInjected(markerPath, injected);
}                                        // 11. 记录本次成功注入的文件，供后续去重
process.exit(0);                         // 12. 放行
```

**关键点**：
- `additionalContext`（stdout）是**主注入通道**，新版 Claude Code 会把它并入模型上下文。
- stderr 那行是**向后兼容**：某些老版本 PreToolUse 只暴露 stderr，用一句提示指向文档。
- 只有**成功读到**的文件才记入去重集合；读失败（missing）的不记，下次还会再试。

---

### `main().catch(() => process.exit(0))`（L190，最外层兜底）

```js
main().catch(() => process.exit(0));
```

**最后一道保险**：`main()` 里任何**未捕获的异常**都被这里静默吞掉并正常退出。

- 体现整套设计哲学：**hook 只增强、绝不挡路**。哪怕脚本自身彻底出错，也不能因此
  阻断 Claude 正常调用工具。
- 与前面各处的"放行退出"（payload 坏、非 cwf skill、无待注入文件）一脉相承：
  异常路径一律 `exit(0)`。

---

## 四、串起来的一句话

> Claude 要调 skill → PreToolUse 触发本脚本 → 脚本查 `SKILL_SPECS` 看是不是 cwf 工作流
> skill → 是就把对应约束文档（会话内去重后）通过 `additionalContext` 注入上下文 →
> `exit(0)` 放行，让 skill 带着约束执行；任何异常都放行，绝不阻断。

---

## 五、相关硬约束速查

改名 / 定制时，以下几处必须彼此对齐，否则 hook 失效：

1. `SKILL_SPECS` 的 key == `src/templates/venus/` 子目录名 == 各 SKILL.md 的 `name`
2. `specDirs()` 里的 `.customworkflow/spec` == `src/init.js` 的 `SPEC_INSTALL_DIR`
3. hook 文件名（`cwf-spec-guard.mjs`）== init.js 的 `HOOK_INSTALL_PATH` == settings.json
   注册的 command 字符串里的文件名
4. `sessionMarkerPath` 的 /tmp 目录名（`cwf-spec-guard`）与其它工作流区分，避免串扰

---

## 六、扩展方向：让 hook 也守护 figma 读取

当前 `matcher` 是 `"Skill"`。若想实现"读 figma 设计稿之前自动注入 UI 还原经验"，
可以再注册一条 `PreToolUse`，把 `matcher` 指向 figma 的 MCP 读取工具（如
`get_design_context`），并在脚本里注入你的「设计模式 → Android API」约束文档
（例：横向 tab → MagicIndicator）。机制与本 hook 完全一致，只是匹配的工具和注入的
文档不同。
