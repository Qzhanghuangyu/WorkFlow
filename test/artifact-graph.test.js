import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getApplyInstructions, getChangeStatus, listChanges, loadSchema } from '../src/mercury/artifact-graph.js';

test('按 schema 依赖计算 artifact 的 ready、blocked 和 done 状态', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'customworkflow-graph-'));
  const changeDir = path.join(root, 'cwfspec', 'changes', 'add-auth');
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

test('listChanges 列出活跃 change 并跳过 archive 目录', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'customworkflow-list-'));
  const changesDir = path.join(root, 'cwfspec', 'changes');
  try {
    assert.deepEqual(listChanges(root), []);

    await mkdir(path.join(changesDir, 'add-auth'), { recursive: true });
    await mkdir(path.join(changesDir, 'add-export'), { recursive: true });
    await mkdir(path.join(changesDir, 'archive', '2026-01-01-old'), { recursive: true });

    const changes = listChanges(root);
    assert.deepEqual(changes.map((change) => change.id), ['add-auth', 'add-export']);
    assert.equal(changes[0].schema, 'spec-driven');
    assert.equal(changes[0].artifacts.find((artifact) => artifact.id === 'proposal').status, 'ready');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('getApplyInstructions 反映 blocked / in_progress / all_done 三态并解析任务', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'customworkflow-apply-'));
  const changeDir = path.join(root, 'cwfspec', 'changes', 'add-auth');
  try {
    await mkdir(changeDir, { recursive: true });

    let apply = getApplyInstructions(root, 'add-auth');
    assert.equal(apply.state, 'blocked');
    assert.deepEqual(apply.missingArtifacts, ['tasks']);

    await writeFile(path.join(changeDir, 'proposal.md'), '# 提案\n');
    await writeFile(path.join(changeDir, 'design.md'), '# 设计\n');
    await mkdir(path.join(changeDir, 'specs', 'auth'), { recursive: true });
    await writeFile(path.join(changeDir, 'specs', 'auth', 'spec.md'), '## 新增需求\n');
    await writeFile(path.join(changeDir, 'tasks.md'), '# 任务\n\n- [x] 1.1 建结构\n- [ ] 1.2 写逻辑\n');

    apply = getApplyInstructions(root, 'add-auth');
    assert.equal(apply.state, 'in_progress');
    assert.deepEqual(apply.missingArtifacts, []);
    assert.deepEqual(apply.progress, { total: 2, completed: 1, remaining: 1 });
    assert.equal(apply.tasks[0].done, true);
    assert.equal(apply.tasks[1].done, false);
    assert.equal(apply.contextFiles.tasks.length, 1);

    await writeFile(path.join(changeDir, 'tasks.md'), '# 任务\n\n- [x] 1.1 建结构\n- [x] 1.2 写逻辑\n');
    apply = getApplyInstructions(root, 'add-auth');
    assert.equal(apply.state, 'all_done');
    assert.deepEqual(apply.progress, { total: 2, completed: 2, remaining: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('从 schema.yaml 读取 design 的模板和指引', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'customworkflow-schema-'));
  const changeDir = path.join(root, 'cwfspec', 'changes', 'add-auth');
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
