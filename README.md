# FallaMercury

FallaMercury 是面向 Android/前端 工程的 AI-native 开发工具，将需求规划、设计稿读取、
任务拆解与代码实施串联成可复用的 Agent 工作流，让 AI 更自然地参与移动端研发全流程。

## 本地编译与安装

拉取代码并进入项目目录：

```bash
git clone <repository-url>
cd FallaMercury
```

执行构建，并通过 npm link 安装到系统的全局可执行目录：

```bash
npm run build && npm run install
```

安装完成后，可在任意终端验证并使用以下命令：

```bash
falla-mercury --help
```

源码发生变化后，在仓库目录重新执行 `npm run build && npm run install`
即可更新本地安装。

FallaMercury registers `falla` (with `mercury` as a compatibility alias),
rather than `openspec`, so it does not overwrite an existing OpenSpec
installation. Changes are created under
`<current-project>/mercuryspec/changes/`, based on the command's working
directory, and never inside the installed FallaMercury package.

The workflow starts with `falla-preflight`: it creates the change, checks
whether the PRD's feature already exists in the codebase, and records unclear
state, boundary, and compatibility items in `preflight.md`. `falla-propose`
then verifies that change exists before creating the remaining artifacts.

To install the bundled skills into a project:

```bash
falla-mercury install /path/to/your-project
```

Use `--no-interactive` to install skills for every supported tool without the
tool-selection prompt:

```bash
falla-mercury install /path/to/your-project --no-interactive
```

The command writes the bundled skills to `.claude/skills/` and
`.codex/skills/`. `falla-mercury init` remains available as a compatibility
alias for `install`.

During initialization, if the target project already contains
`openspec/specs/`, its project specs are copied recursively into
`.falla/spec/` with their directory structure preserved. Running init again
refreshes those copied constraints.
