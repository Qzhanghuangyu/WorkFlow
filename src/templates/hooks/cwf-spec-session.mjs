#!/usr/bin/env node
// CustomWorkFlow SessionStart hook (Codex).
//
// Codex has no `Skill` tool to hang a PreToolUse hook on — invoking a skill is
// just the model reading SKILL.md via a shell command, so a per-skill matcher
// never fires. Instead this SessionStart hook injects the global spec entry
// (soul.md) into context once at session start, guaranteeing the core
// constraints are always present. The per-phase docs
// (preflight/propose/apply/archive) are still pulled in by SKILL.md step 0
// when the relevant skill runs.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The global entry doc, injected every session.
const GLOBAL_SPEC = '[Must Read]soul.md';

// Per-phase docs the model should read when it runs each skill.
const PHASE_SPECS = [
  ['cwf-preflight', '[分析必读]preflight.md'],
  ['cwf-propose', '[架构必读]propose.md、[UI控件必读]ui-components.md 与 [经验必读]lessons.md'],
  ['cwf-apply-change', '[模块选读]apply.md、[UI控件必读]ui-components.md 与 [经验必读]lessons.md'],
  ['cwf-archive-change', '[任务选读]archive.md 与 [经验必读]lessons.md'],
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

/** Candidate spec directories, most specific first. */
function specDirs(projectDir) {
  return [path.join(projectDir, '.customworkflow', 'spec'), path.join(projectDir, 'spec')];
}

async function loadSpec(projectDir, relativeFile) {
  for (const dir of specDirs(projectDir)) {
    try {
      return await readFile(path.join(dir, relativeFile), 'utf8');
    } catch {
      // try next candidate dir
    }
  }
  return null;
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();

  const soul = await loadSpec(projectDir, GLOBAL_SPEC);

  const phaseList = PHASE_SPECS.map(
    ([skill, doc]) => `- ${skill} 前必读：\`.customworkflow/spec/${doc}\``
  ).join('\n');

  const header =
    '【CustomWorkFlow 全局约束 — 本会话必须遵守】\n' +
    '以下是 CustomWorkFlow 的核心思想（soul）。使用 cwf-preflight / cwf-propose / ' +
    'cwf-apply-change / cwf-archive-change 等 skill 时必须遵循，并在对应阶段额外读取该阶段的 spec：\n' +
    phaseList;

  const additionalContext = soul
    ? `${header}\n\n===== ${GLOBAL_SPEC} =====\n${soul.trim()}`
    : `${header}\n\n（提示：未找到 .customworkflow/spec/${GLOBAL_SPEC}，请确认它已随安装写入。）`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext,
      },
    })
  );
  process.exit(0);
}

main().catch(() => process.exit(0));
