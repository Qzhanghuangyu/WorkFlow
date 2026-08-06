import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { createChange, validateChangeName } from '../src/mercury/new-change.js';

const execFileAsync = promisify(execFile);

test('creates a complete local OpenSpec change scaffold', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-openspec-'));
  try {
    const change = await createChange('add-auth', {
      cwd: root,
      schema: 'custom-schema',
      goal: 'Add account authentication',
      description: 'Allow users to sign in.',
    });

    assert.equal(change.path, path.join(root, 'mercuryspec', 'changes', 'add-auth'));
    assert.equal(
      await readFile(change.metadataPath, 'utf8'),
      `schema: "custom-schema"\ncreated: ${new Date().toISOString().slice(0, 10)}\ngoal: "Add account authentication"\n`
    );
    assert.equal(await readFile(path.join(root, 'mercuryspec', 'config.yaml'), 'utf8'), 'schema: spec-driven\n');
    assert.equal(await readFile(path.join(change.path, 'README.md'), 'utf8'), '# add-auth\n\nAllow users to sign in.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not search an ancestor for an OpenSpec root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-openspec-'));
  const nested = path.join(root, 'packages', 'app');
  try {
    await createChange('initial-change', { cwd: root });
    const change = await createChange('fix-login', { cwd: nested });
    assert.equal(change.root, nested);
    assert.equal(change.path, path.join(nested, 'mercuryspec', 'changes', 'fix-login'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid and duplicate change names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-openspec-'));
  try {
    assert.match(validateChangeName('Add Auth'), /kebab-case/);
    await assert.rejects(() => createChange('Add Auth', { cwd: root }), /kebab-case/);
    await createChange('add-auth', { cwd: root });
    await assert.rejects(() => createChange('add-auth', { cwd: root }), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the falla executable returns machine-readable change details in its configured home', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-openspec-'));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(process.cwd(), 'bin', 'mercury.js'),
      'new',
      'change',
      'add-billing',
      '--json',
    ], {
      cwd: root,
      env: { ...process.env, FALLA_MERCURY_HOME: root },
    });
    const output = JSON.parse(stdout);
    assert.equal(output.change.id, 'add-billing');
    assert.equal(
      output.change.path,
      path.join(path.resolve(root), 'mercuryspec', 'changes', 'add-billing')
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('defaults the CLI planning root to the current project directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-project-'));
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), 'src', 'mercury', 'new-change.js')
  ).href;
  const env = { ...process.env };
  delete env.FALLA_MERCURY_HOME;

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { getPlanningRoot } from ${JSON.stringify(moduleUrl)}; console.log(getPlanningRoot());`,
      ],
      { cwd: root, env }
    );
    assert.equal(stdout.trim(), await realpath(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
