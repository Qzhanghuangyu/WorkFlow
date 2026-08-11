import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const templatesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'templates'
);
const templateDirectory = path.join(templatesRoot, 'venus');
const specTemplateDirectory = path.join(templatesRoot, 'spec');
const hookTemplateFile = path.join(templatesRoot, 'hooks', 'cwf-spec-guard.mjs');
const codexHookTemplateFile = path.join(templatesRoot, 'hooks', 'cwf-spec-session.mjs');

/** Directory (relative to a target project) where spec constraints are installed. */
export const SPEC_INSTALL_DIR = path.join('.customworkflow', 'spec');
/** OpenSpec directory (relative to a target project) containing project specs. */
export const OPENSPEC_SPEC_DIR = path.join('openspec', 'specs');
/** Path (relative to a target project) of the installed Claude PreToolUse hook. */
export const HOOK_INSTALL_PATH = path.join('.claude', 'hooks', 'cwf-spec-guard.mjs');
/** Path (relative to a target project) of the installed Codex SessionStart hook. */
export const CODEX_HOOK_INSTALL_PATH = path.join('.codex', 'hooks', 'cwf-spec-session.mjs');
/** Path (relative to a target project) of the Codex config that registers the hook. */
export const CODEX_CONFIG_PATH = path.join('.codex', 'config.toml');

export const TOOLS = [
  { id: 'claude', name: 'Claude Code', directory: '.claude' },
  { id: 'codex', name: 'Codex', directory: '.codex' },
];

/** Returns the OpenSpec skills bundled with CustomWorkFlow, sorted by name. */
export async function getSkillTemplates() {
  const entries = await readdir(templateDirectory, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const skillDirectory = path.join(templateDirectory, entry.name);
        const relativeFiles = await listFilesRecursively(skillDirectory);
        const files = await Promise.all(
          relativeFiles.map(async (relativePath) => ({
            relativePath,
            content: await readFile(path.join(skillDirectory, relativePath)),
          }))
        );
        const skillFile = files.find((file) => file.relativePath === 'SKILL.md');
        if (!skillFile) throw new Error(`Skill template '${entry.name}' is missing SKILL.md`);
        return {
          name: entry.name,
          content: skillFile.content.toString('utf8'),
          files,
        };
      })
  ).then((templates) => templates.sort((a, b) => a.name.localeCompare(b.name)));
}

/** Returns the spec constraint documents bundled with CustomWorkFlow, sorted by name. */
export async function getSpecTemplates() {
  const entries = await readdir(specTemplateDirectory, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => ({
        name: entry.name,
        content: await readFile(path.join(specTemplateDirectory, entry.name), 'utf8'),
      }))
  ).then((specs) => specs.sort((a, b) => a.name.localeCompare(b.name)));
}

/**
 * Installs the spec constraint documents into `<root>/.customworkflow/spec/` so skills
 * and the PreToolUse hook can always resolve them, regardless of project.
 *
 * @param {string} root resolved project directory
 * @returns {Promise<string[]>} absolute paths of written spec files
 */
export async function installSpecDocs(root) {
  const specs = await getSpecTemplates();
  const written = [];
  const targetDir = path.join(root, SPEC_INSTALL_DIR);
  await mkdir(targetDir, { recursive: true });
  for (const spec of specs) {
    const target = path.join(targetDir, spec.name);
    await writeFile(target, spec.content, 'utf8');
    written.push(target);
  }
  return written;
}

/**
 * Returns every regular file below a directory as a relative path. Directory
 * entries are sorted so installation output is deterministic.
 *
 * @param {string} directory directory to scan
 * @param {string} [relativeDirectory] path relative to the initial directory
 * @returns {Promise<string[]>}
 */
async function listFilesRecursively(directory, relativeDirectory = '') {
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * If the target project already uses OpenSpec, copies its project specs from
 * `<root>/openspec/specs/` into CustomWorkFlow's shared constraint directory.
 * The OpenSpec subtree is preserved, and a repeated init refreshes changed
 * files. Missing OpenSpec directories are intentionally treated as a no-op.
 *
 * @param {string} root resolved project directory
 * @returns {Promise<string[]>} absolute paths of copied project spec files
 */
export async function installOpenSpecConstraints(root) {
  const sourceDir = path.join(root, OPENSPEC_SPEC_DIR);
  try {
    if (!(await stat(sourceDir)).isDirectory()) return [];
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return [];
    throw error;
  }

  const relativeFiles = await listFilesRecursively(sourceDir);
  const written = [];
  for (const relativeFile of relativeFiles) {
    const source = path.join(sourceDir, relativeFile);
    const target = path.join(root, SPEC_INSTALL_DIR, relativeFile);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    written.push(target);
  }
  return written;
}

/**
 * Installs the Claude PreToolUse hook that forces cwf-* skills to load their
 * spec constraints. Writes the hook script and merges (never overwrites) the
 * hook entry into `<root>/.claude/settings.json`.
 *
 * @param {string} root resolved project directory
 * @returns {Promise<string[]>} absolute paths written or updated
 */
export async function installClaudeSpecHook(root) {
  const written = [];

  const hookScript = await readFile(hookTemplateFile, 'utf8');
  const hookTarget = path.join(root, HOOK_INSTALL_PATH);
  await mkdir(path.dirname(hookTarget), { recursive: true });
  await writeFile(hookTarget, hookScript, 'utf8');
  written.push(hookTarget);

  const settingsPath = path.join(root, '.claude', 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    settings = {};
  }

  const command = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/cwf-spec-guard.mjs"';
  settings.hooks = settings.hooks ?? {};
  const preToolUse = Array.isArray(settings.hooks.PreToolUse)
    ? settings.hooks.PreToolUse
    : [];

  const alreadyInstalled = preToolUse.some(
    (entry) =>
      entry?.matcher === 'Skill' &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((hook) => hook?.command === command)
  );

  if (!alreadyInstalled) {
    preToolUse.push({
      matcher: 'Skill',
      hooks: [{ type: 'command', command }],
    });
    settings.hooks.PreToolUse = preToolUse;
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }
  written.push(settingsPath);

  return written;
}

const CODEX_HOOK_MARKER = '# cwf-spec-session hook';
const CODEX_HOOK_CONFIG = `${CODEX_HOOK_MARKER}
[[hooks.SessionStart]]

[[hooks.SessionStart.hooks]]
type = "command"
command = "node ./.codex/hooks/cwf-spec-session.mjs"
`;

/**
 * Installs the Codex SessionStart hook that injects the global spec entry
 * (soul.md) at session start. Codex has no `Skill` tool to match on, so a
 * per-skill PreToolUse hook can't fire; SessionStart runs once per session and
 * guarantees the core constraints are present. Writes the hook script and
 * appends (idempotently) the hook registration to `.codex/config.toml`.
 *
 * @param {string} root resolved project directory
 * @returns {Promise<string[]>} absolute paths written or updated
 */
export async function installCodexSpecHook(root) {
  const written = [];

  const hookScript = await readFile(codexHookTemplateFile, 'utf8');
  const hookTarget = path.join(root, CODEX_HOOK_INSTALL_PATH);
  await mkdir(path.dirname(hookTarget), { recursive: true });
  await writeFile(hookTarget, hookScript, 'utf8');
  written.push(hookTarget);

  const configPath = path.join(root, CODEX_CONFIG_PATH);
  let existing = '';
  try {
    existing = await readFile(configPath, 'utf8');
  } catch {
    existing = '';
  }

  if (!existing.includes(CODEX_HOOK_MARKER)) {
    const next = existing.trim()
      ? `${existing.trimEnd()}\n\n${CODEX_HOOK_CONFIG}`
      : CODEX_HOOK_CONFIG;
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, next, 'utf8');
  }
  written.push(configPath);

  return written;
}

const AGENTS_MARKER = '<!-- cwf-spec-guard -->';
const AGENTS_SECTION = `${AGENTS_MARKER}
## CustomWorkFlow spec 约束（必读）

使用 \`cwf-preflight\` / \`cwf-propose\` / \`cwf-apply-change\` / \`cwf-archive-change\` 这些 skill 前，
**必须**先读取 \`.customworkflow/spec/\` 下对应前缀的约束文档：

- 全局入口（任何阶段必读）：\`.customworkflow/spec/[Must Read]soul.md\`
- PRD 分析（preflight）：\`.customworkflow/spec/[分析必读]preflight.md\`
- 规划 / 拆解（propose）：\`.customworkflow/spec/[架构必读]propose.md\`
- 实施（apply）：\`.customworkflow/spec/[模块选读]apply.md\`
- 归档（archive）：\`.customworkflow/spec/[任务选读]archive.md\`
- UI 控件映射（propose 拆控件 / apply 实施 UI 时必读）：\`.customworkflow/spec/[UI控件必读]ui-components.md\`

前缀含义：\`[Must Read]\`=全局必读，\`[分析必读]\`=PRD 分析阶段必读，\`[架构必读]\`=拆解阶段必读，\`[模块选读]\`=实施按需读，\`[任务选读]\`=对应环节才读，\`[UI控件必读]\`=涉及 UI 控件的拆解与实施时必读。
未读取并理解约束前，不得执行对应 skill 的后续步骤。
`;

/**
 * Ensures `<root>/AGENTS.md` instructs Codex (which has no PreToolUse hook) to
 * read the spec constraints before running cwf-* skills. Idempotent.
 *
 * @param {string} root resolved project directory
 * @returns {Promise<string>} absolute path of AGENTS.md
 */
export async function installAgentsGuidance(root) {
  const agentsPath = path.join(root, 'AGENTS.md');
  let existing = '';
  try {
    existing = await readFile(agentsPath, 'utf8');
  } catch {
    existing = '';
  }

  if (existing.includes(AGENTS_MARKER)) return agentsPath;

  const next = existing.trim()
    ? `${existing.trimEnd()}\n\n${AGENTS_SECTION}`
    : AGENTS_SECTION;
  await writeFile(agentsPath, next, 'utf8');
  return agentsPath;
}

/**
 * Installs the shared CustomWorkFlow skills into every selected project-local
 * agent directory, plus the bundled and existing OpenSpec constraint
 * documents, the Claude PreToolUse hook (Claude only), and Codex guidance in
 * AGENTS.md.
 *
 * @param {string} projectPath absolute or relative project directory
 * @param {string[]} [toolIds] agent tool IDs to configure
 * @returns {Promise<string[]>} absolute paths of every written file
 */
export async function installSkills(projectPath, toolIds = TOOLS.map((tool) => tool.id)) {
  const root = path.resolve(projectPath);
  const installedFiles = [];
  const templates = await getSkillTemplates();

  for (const toolId of toolIds) {
    const tool = TOOLS.find((candidate) => candidate.id === toolId);
    if (!tool) throw new Error(`Unknown tool '${toolId}'. Valid tools: claude, codex`);

    for (const template of templates) {
      for (const file of template.files) {
        const skillFile = path.join(
          root,
          tool.directory,
          'skills',
          template.name,
          file.relativePath
        );
        await mkdir(path.dirname(skillFile), { recursive: true });
        await writeFile(skillFile, file.content);
        installedFiles.push(skillFile);
      }
    }
  }

  // Spec docs are shared by both tools; install them whenever any tool is set up.
  installedFiles.push(...(await installSpecDocs(root)));
  installedFiles.push(...(await installOpenSpecConstraints(root)));

  // Claude enforces via a PreToolUse hook keyed on the Skill tool. Codex has no
  // Skill tool, so it enforces via a SessionStart hook (injects soul.md once)
  // plus AGENTS.md guidance for the per-phase docs.
  if (toolIds.includes('claude')) {
    installedFiles.push(...(await installClaudeSpecHook(root)));
  }
  if (toolIds.includes('codex')) {
    installedFiles.push(...(await installCodexSpecHook(root)));
    installedFiles.push(await installAgentsGuidance(root));
  }

  return installedFiles;
}
