#!/usr/bin/env node
// CustomWorkFlow PreToolUse hook.
//
// Fires before the `Skill` tool runs. When the invoked skill is one of the
// cwf-* workflow skills, this hook loads the matching spec/ constraint
// documents and injects them into the model context so the skill can never run
// without its architectural constraints in scope. Any other skill is passed
// through untouched.
//
// Injection is deduplicated per session: each spec file is injected at most
// once per session, so shared docs (soul.md) and repeat skill calls don't
// pile duplicate copies into the context window.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// skill name -> spec files (relative to the spec dir) that must be in context.
const SKILL_SPECS = {
  'cwf-preflight': ['[Must Read]soul.md', '[分析必读]preflight.md'],
  'cwf-propose': ['[Must Read]soul.md', '[架构必读]propose.md', '[UI控件必读]ui-components.md'],
  'cwf-apply-change': ['[Must Read]soul.md', '[模块选读]apply.md', '[UI控件必读]ui-components.md'],
  'cwf-archive-change': ['[Must Read]soul.md', '[任务选读]archive.md'],
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    // If nothing is piped in, don't hang.
    if (process.stdin.isTTY) resolve('');
  });
}

/** Pull the invoked skill name out of the PreToolUse payload, tolerating shapes. */
function extractSkillName(payload) {
  const input = payload?.tool_input ?? payload?.toolInput ?? {};
  return (
    input.name ??
    input.skill ??
    input.skillName ??
    input.command ??
    ''
  )
    .toString()
    .trim();
}

/** Candidate spec directories, most specific first. */
function specDirs(projectDir) {
  return [
    path.join(projectDir, '.customworkflow', 'spec'),
    path.join(projectDir, 'spec'),
  ];
}

async function loadSpec(projectDir, relativeFile) {
  for (const dir of specDirs(projectDir)) {
    try {
      const full = path.join(dir, relativeFile);
      const content = await readFile(full, 'utf8');
      return { path: full, content };
    } catch {
      // try next candidate dir
    }
  }
  return null;
}

/**
 * Per-session marker file recording which spec files have already been injected
 * this session, so shared docs (e.g. soul.md) are not re-injected on every
 * cwf-* skill call. Falls back to no dedup when there is no session id.
 */
function sessionMarkerPath(sessionId) {
  if (!sessionId) return null;
  const safeId = sessionId.toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(os.tmpdir(), 'cwf-spec-guard', `${safeId}.json`);
}

async function readInjected(markerPath) {
  if (!markerPath) return new Set();
  try {
    const parsed = JSON.parse(await readFile(markerPath, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function writeInjected(markerPath, injectedSet) {
  if (!markerPath) return;
  try {
    await mkdir(path.dirname(markerPath), { recursive: true });
    await writeFile(markerPath, JSON.stringify([...injectedSet]), 'utf8');
  } catch {
    // Best-effort: dedup is an optimization, never block the tool over it.
  }
}

async function main() {
  const raw = await readStdin();

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // Malformed payload: don't block the tool, just pass through.
    process.exit(0);
  }

  const skillName = extractSkillName(payload);
  const specFiles = SKILL_SPECS[skillName];
  if (!specFiles) {
    // Not a cwf workflow skill — do not interfere.
    process.exit(0);
  }

  const projectDir =
    process.env.CLAUDE_PROJECT_DIR ||
    payload?.cwd ||
    process.cwd();

  // Skip files already injected earlier in this session so shared docs
  // (soul.md) and repeat skill calls don't duplicate context.
  const sessionId = payload?.session_id ?? payload?.sessionId ?? '';
  const markerPath = sessionMarkerPath(sessionId);
  const injected = await readInjected(markerPath);
  const pending = specFiles.filter((relative) => !injected.has(relative));

  if (pending.length === 0) {
    // Everything is already in context this session — nothing to inject.
    process.exit(0);
  }

  const sections = [];
  const missing = [];
  const loadedFiles = [];
  for (const relative of pending) {
    const loaded = await loadSpec(projectDir, relative);
    if (loaded) {
      sections.push(`===== ${relative} =====\n${loaded.content.trim()}`);
      loadedFiles.push(relative);
    } else {
      missing.push(relative);
    }
  }

  const header =
    `【CustomWorkFlow spec 约束 — 使用 ${skillName} 前必须遵守】\n` +
    '以下是本阶段的强制约束文档，请在执行该 skill 时严格遵循：';

  const missingNote = missing.length
    ? `\n\n（提示：未找到以下 spec 文件，请人工确认它们已随安装写入 .customworkflow/spec/：${missing.join('、')}）`
    : '';

  const additionalContext =
    sections.length > 0
      ? `${header}\n\n${sections.join('\n\n')}${missingNote}`
      : `${header}${missingNote}`;

  // Primary path: inject as additionalContext (newer Claude Code).
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output));

  // Fallback for older versions that surface stderr on PreToolUse:
  // a short reminder pointing at the spec files.
  process.stderr.write(
    `[CustomWorkFlow] ${skillName} 前请阅读 .customworkflow/spec 下：${pending.join('、')}\n`
  );

  // Record successfully-loaded files so they are not re-injected this session.
  if (loadedFiles.length > 0) {
    for (const relative of loadedFiles) injected.add(relative);
    await writeInjected(markerPath, injected);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
