import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getSkillTemplates,
  getSpecTemplates,
  installSkills,
  SPEC_INSTALL_DIR,
  OPENSPEC_SPEC_DIR,
  HOOK_INSTALL_PATH,
  CODEX_HOOK_INSTALL_PATH,
  CODEX_CONFIG_PATH,
} from '../src/init.js';

/** Runs a hook script with a payload on stdin and resolves { stdout }. */
function runHookScript(scriptPath, projectPath, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectPath },
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('close', () => resolve({ stdout }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

/**
 * Runs the installed hook with a payload on stdin and resolves { stdout }.
 * Uses spawn with an explicit stdin.end() — execFile's `input` option does not
 * reliably close the child's stdin, so the hook's `end` event never fires.
 */
function runHook(projectPath, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectPath, HOOK_INSTALL_PATH)], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectPath },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', () => resolve({ stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

test('installs the shared skill template for Claude and Codex', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath);

    const templates = await getSkillTemplates();
    for (const template of templates) {
      assert.equal(
        await readFile(path.join(projectPath, '.claude', 'skills', template.name, 'SKILL.md'), 'utf8'),
        template.content
      );
      assert.equal(
        await readFile(path.join(projectPath, '.codex', 'skills', template.name, 'SKILL.md'), 'utf8'),
        template.content
      );
    }

    const preflightMetadata = await readFile(
      path.join(projectPath, '.codex', 'skills', 'falla-preflight', 'agents', 'openai.yaml'),
      'utf8'
    );
    assert.match(preflightMetadata, /display_name: "Falla Preflight"/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('installs only the tools selected during setup', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['claude']);
    const templates = await getSkillTemplates();
    assert.equal(
      await readFile(path.join(projectPath, '.claude', 'skills', 'falla-propose', 'SKILL.md'), 'utf8'),
      templates.find((template) => template.name === 'falla-propose').content
    );
    // Codex was not selected, so its skills directory should not exist.
    await assert.rejects(() => stat(path.join(projectPath, '.codex')));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('preflight creates the change record and propose only requires that change', async () => {
  const templates = await getSkillTemplates();
  const preflight = templates.find((template) => template.name === 'falla-preflight');
  const propose = templates.find((template) => template.name === 'falla-propose');

  assert.ok(preflight, 'expected falla-preflight template');
  assert.match(preflight.content, /Stateful Interactions/);
  assert.match(preflight.content, /Boundary and Exception Cases/);
  assert.match(preflight.content, /Code Compatibility Gaps/);
  assert.match(preflight.content, /falla new change "<name>" --json/);
  assert.match(preflight.content, /preflight\.md/);
  assert.match(preflight.content, /已实现.*部分实现.*未实现.*无法判断/s);
  assert.match(propose.content, /确认 change 目录存在/);
  assert.match(propose.content, /change 目录存在是 propose 唯一的 preflight 前置检查/);
  assert.doesNotMatch(propose.content, /Ready for propose/);
  assert.doesNotMatch(propose.content, /falla new change "<name>"/);
});

test('installs spec constraint docs into .falla/spec for any tool', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['claude']);
    const specs = await getSpecTemplates();
    assert.ok(specs.length > 0, 'expected bundled spec templates');
    for (const spec of specs) {
      assert.equal(
        await readFile(path.join(projectPath, SPEC_INSTALL_DIR, spec.name), 'utf8'),
        spec.content
      );
    }
    // The global entry must be present.
    assert.ok(specs.some((spec) => spec.name === '[Must Read]soul.md'));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('copies existing OpenSpec project specs into .falla/spec recursively', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    const capabilityDir = path.join(projectPath, OPENSPEC_SPEC_DIR, 'payments');
    const ignoredChangeDir = path.join(projectPath, 'openspec', 'changes', 'pending');
    await mkdir(capabilityDir, { recursive: true });
    await mkdir(ignoredChangeDir, { recursive: true });
    await writeFile(path.join(capabilityDir, 'spec.md'), '# Payments constraints\n', 'utf8');
    await writeFile(path.join(capabilityDir, 'metadata.yaml'), 'owner: platform\n', 'utf8');
    await writeFile(path.join(ignoredChangeDir, 'proposal.md'), '# Not a project spec\n', 'utf8');

    const installed = await installSkills(projectPath, ['claude']);
    const copiedSpec = path.join(projectPath, SPEC_INSTALL_DIR, 'payments', 'spec.md');
    const copiedMetadata = path.join(projectPath, SPEC_INSTALL_DIR, 'payments', 'metadata.yaml');

    assert.equal(await readFile(copiedSpec, 'utf8'), '# Payments constraints\n');
    assert.equal(await readFile(copiedMetadata, 'utf8'), 'owner: platform\n');
    assert.ok(installed.includes(copiedSpec));
    assert.ok(installed.includes(copiedMetadata));
    await assert.rejects(() => stat(path.join(projectPath, SPEC_INSTALL_DIR, 'pending', 'proposal.md')));

    // Re-initialization refreshes project constraints in place.
    await writeFile(path.join(capabilityDir, 'spec.md'), '# Updated constraints\n', 'utf8');
    await installSkills(projectPath, ['claude']);
    assert.equal(await readFile(copiedSpec, 'utf8'), '# Updated constraints\n');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('installs the Claude PreToolUse hook and settings entry', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['claude']);

    // Hook script written.
    const hook = await readFile(path.join(projectPath, HOOK_INSTALL_PATH), 'utf8');
    assert.match(hook, /falla-propose/);

    // settings.json contains a PreToolUse hook matching the Skill tool.
    const settings = JSON.parse(
      await readFile(path.join(projectPath, '.claude', 'settings.json'), 'utf8')
    );
    const preToolUse = settings.hooks.PreToolUse;
    assert.ok(Array.isArray(preToolUse));
    const skillHook = preToolUse.find((entry) => entry.matcher === 'Skill');
    assert.ok(skillHook, 'expected a Skill matcher hook');
    assert.match(skillHook.hooks[0].command, /falla-spec-guard\.mjs/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('merges the hook without duplicating on repeat install', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['claude']);
    await installSkills(projectPath, ['claude']);
    const settings = JSON.parse(
      await readFile(path.join(projectPath, '.claude', 'settings.json'), 'utf8')
    );
    const skillHooks = settings.hooks.PreToolUse.filter((entry) => entry.matcher === 'Skill');
    assert.equal(skillHooks.length, 1);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('does not install the Claude hook when only Codex is selected', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['codex']);
    await assert.rejects(() => stat(path.join(projectPath, HOOK_INSTALL_PATH)));
    // Codex guidance is written to AGENTS.md.
    const agents = await readFile(path.join(projectPath, 'AGENTS.md'), 'utf8');
    assert.match(agents, /\.falla\/spec/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('preserves existing AGENTS.md content and is idempotent', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    const agentsPath = path.join(projectPath, 'AGENTS.md');
    await installSkills(projectPath, ['codex']);
    const first = await readFile(agentsPath, 'utf8');
    await installSkills(projectPath, ['codex']);
    const second = await readFile(agentsPath, 'utf8');
    assert.equal(first, second, 'AGENTS.md guidance should not be appended twice');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('hook injects spec context for a falla skill', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  const sessionId = `inject-${path.basename(projectPath)}`;
  try {
    await installSkills(projectPath, ['claude']);
    const { stdout } = await runHook(projectPath, {
      session_id: sessionId,
      tool_input: { name: 'falla-propose' },
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.match(ctx, /\[Must Read\]soul\.md/);
    assert.match(ctx, /\[架构必读\]propose\.md/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    await rm(path.join(os.tmpdir(), 'falla-spec-guard', `${sessionId}.json`), { force: true });
  }
});

test('hook injects global and analysis constraints for falla-preflight', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  const sessionId = `preflight-${path.basename(projectPath)}`;
  try {
    await installSkills(projectPath, ['claude']);
    const { stdout } = await runHook(projectPath, {
      session_id: sessionId,
      tool_input: { name: 'falla-preflight' },
    });
    const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /\[Must Read\]soul\.md/);
    assert.match(ctx, /\[分析必读\]preflight\.md/);
    assert.doesNotMatch(ctx, /\[架构必读\]propose\.md/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    await rm(path.join(os.tmpdir(), 'falla-spec-guard', `${sessionId}.json`), { force: true });
  }
});

test('hook does not inject for a non-falla skill', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  const sessionId = `nonfalla-${path.basename(projectPath)}`;
  try {
    await installSkills(projectPath, ['claude']);
    const { stdout } = await runHook(projectPath, {
      session_id: sessionId,
      tool_input: { name: 'some-other-skill' },
    });
    assert.equal(stdout.trim(), '');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    await rm(path.join(os.tmpdir(), 'falla-spec-guard', `${sessionId}.json`), { force: true });
  }
});

test('hook deduplicates spec injection within a session', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  const sessionId = `dedup-${path.basename(projectPath)}`;
  try {
    await installSkills(projectPath, ['claude']);

    // First propose call injects soul + propose.
    const first = JSON.parse(
      (await runHook(projectPath, { session_id: sessionId, tool_input: { name: 'falla-propose' } }))
        .stdout
    ).hookSpecificOutput.additionalContext;
    assert.match(first, /\[Must Read\]soul\.md/);
    assert.match(first, /\[架构必读\]propose\.md/);

    // Repeat propose call: everything already injected -> empty output.
    const second = (
      await runHook(projectPath, { session_id: sessionId, tool_input: { name: 'falla-propose' } })
    ).stdout;
    assert.equal(second.trim(), '');

    // Different skill same session: only its unique doc, soul is skipped.
    const third = JSON.parse(
      (
        await runHook(projectPath, {
          session_id: sessionId,
          tool_input: { name: 'falla-apply-change' },
        })
      ).stdout
    ).hookSpecificOutput.additionalContext;
    assert.doesNotMatch(third, /\[Must Read\]soul\.md/);
    assert.match(third, /\[模块选读\]apply\.md/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    await rm(path.join(os.tmpdir(), 'falla-spec-guard', `${sessionId}.json`), { force: true });
  }
});

test('hook re-injects for a different session', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  const sessA = `a-${path.basename(projectPath)}`;
  const sessB = `b-${path.basename(projectPath)}`;
  try {
    await installSkills(projectPath, ['claude']);
    await runHook(projectPath, { session_id: sessA, tool_input: { name: 'falla-propose' } });
    const other = JSON.parse(
      (await runHook(projectPath, { session_id: sessB, tool_input: { name: 'falla-propose' } }))
        .stdout
    ).hookSpecificOutput.additionalContext;
    assert.match(other, /\[Must Read\]soul\.md/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
    for (const sid of [sessA, sessB]) {
      await rm(path.join(os.tmpdir(), 'falla-spec-guard', `${sid}.json`), { force: true });
    }
  }
});

test('installs the Codex SessionStart hook and config registration', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['codex']);

    // Hook script written.
    const hook = await readFile(path.join(projectPath, CODEX_HOOK_INSTALL_PATH), 'utf8');
    assert.match(hook, /SessionStart/);

    // config.toml registers the SessionStart hook.
    const config = await readFile(path.join(projectPath, CODEX_CONFIG_PATH), 'utf8');
    assert.match(config, /\[\[hooks\.SessionStart\]\]/);
    assert.match(config, /falla-spec-session\.mjs/);

    // Claude hook must NOT be installed for a codex-only setup.
    await assert.rejects(() => stat(path.join(projectPath, HOOK_INSTALL_PATH)));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('Codex hook config is appended idempotently and preserves existing config', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    // Seed an existing config.toml.
    await installSkills(projectPath, ['codex']);
    const first = await readFile(path.join(projectPath, CODEX_CONFIG_PATH), 'utf8');
    await installSkills(projectPath, ['codex']);
    const second = await readFile(path.join(projectPath, CODEX_CONFIG_PATH), 'utf8');
    assert.equal(first, second, 'hook config should not be appended twice');
    // Only one SessionStart block.
    assert.equal(second.match(/\[\[hooks\.SessionStart\]\]/g).length, 1);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('Codex SessionStart hook injects soul.md and phase pointers', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-'));
  try {
    await installSkills(projectPath, ['codex']);
    const scriptPath = path.join(projectPath, CODEX_HOOK_INSTALL_PATH);
    const { stdout } = await runHookScript(scriptPath, projectPath, {
      hook_event_name: 'SessionStart',
      source: 'startup',
      cwd: projectPath,
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    const ctx = parsed.hookSpecificOutput.additionalContext;
    // Global soul doc content is injected.
    assert.match(ctx, /FallaMercury/);
    // Phase pointers are present.
    assert.match(ctx, /falla-propose/);
    assert.match(ctx, /\[架构必读\]propose\.md/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
