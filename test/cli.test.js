import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('install command writes skills for all supported tools non-interactively', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-cli-'));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(process.cwd(), 'bin', 'falla-mercury.js'),
      'install',
      projectPath,
      '--no-interactive',
      '--skip-figma-mcp',
      '--skip-lark-cli',
    ]);

    assert.match(stdout, /Installed \d+ files/);
    await stat(path.join(projectPath, '.claude', 'skills', 'falla-preflight', 'SKILL.md'));
    await stat(path.join(projectPath, '.claude', 'skills', 'falla-propose', 'SKILL.md'));
    await stat(path.join(projectPath, '.codex', 'skills', 'falla-preflight', 'agents', 'openai.yaml'));
    await stat(path.join(projectPath, '.codex', 'skills', 'falla-apply-change', 'SKILL.md'));
    await stat(path.join(projectPath, '.falla', 'spec', '[Must Read]soul.md'));
    await stat(path.join(projectPath, '.claude', 'hooks', 'falla-spec-guard.mjs'));
    await stat(path.join(projectPath, 'AGENTS.md'));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
