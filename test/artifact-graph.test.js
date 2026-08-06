import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getChangeStatus, loadSchema } from '../src/mercury/artifact-graph.js';

test('按 schema 依赖计算 artifact 的 ready、blocked 和 done 状态', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-graph-'));
  const changeDir = path.join(root, 'mercuryspec', 'changes', 'add-auth');
  try {
    await mkdir(changeDir, { recursive: true });
    await writeFile(path.join(changeDir, '.openspec.yaml'), 'schema: spec-driven\n');

    let status = getChangeStatus(root, 'add-auth');
    assert.deepEqual(status.artifacts.map(({ id, status: state }) => [id, state]), [
      ['proposal', 'ready'], ['design', 'blocked'], ['specs', 'blocked'], ['tasks', 'blocked'],
    ]);

    await writeFile(path.join(changeDir, 'proposal.md'), '# 提案\n');
    await writeFile(path.join(changeDir, 'design.md'), '# 设计\n');
    await mkdir(path.join(changeDir, 'specs', 'auth'), { recursive: true });
    await writeFile(path.join(changeDir, 'specs', 'auth', 'spec.md'), '## 新增需求\n');
    status = getChangeStatus(root, 'add-auth');
    assert.deepEqual(status.artifacts.map(({ id, status: state }) => [id, state]), [
      ['proposal', 'done'], ['design', 'done'], ['specs', 'done'], ['tasks', 'ready'],
    ]);
    assert.deepEqual(status.applyRequires, ['tasks']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('从 schema.yaml 读取 design 的模板和指引', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'falla-mercury-schema-'));
  const changeDir = path.join(root, 'mercuryspec', 'changes', 'add-auth');
  try {
    await mkdir(changeDir, { recursive: true });
    const { schema } = loadSchema(root, changeDir);
    const design = schema.artifacts.find((artifact) => artifact.id === 'design');
    assert.match(design.template, /^# 设计/m);
    assert.match(design.instruction, /如何实现此变更/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
