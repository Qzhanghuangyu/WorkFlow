import assert from 'node:assert/strict';
import test from 'node:test';
import { installFigmaMcp } from '../src/ui/figma-mcp.js';

test('installs the Figma integration using each selected agent CLI', async () => {
  const calls = [];
  const results = await installFigmaMcp(['claude', 'codex'], async (command, args) => {
    calls.push({ command, args });
  });

  assert.deepEqual(calls, [
    { command: 'claude', args: ['plugin', 'install', 'figma@claude-plugins-official'] },
    { command: 'codex', args: ['mcp', 'add', 'figma', '--url', 'https://mcp.figma.com/mcp'] },
  ]);
  assert.deepEqual(results, [
    { toolId: 'claude', success: true },
    { toolId: 'codex', success: true },
  ]);
});

test('reports an MCP installation failure without preventing other installations', async () => {
  const results = await installFigmaMcp(['codex', 'claude'], async (command) => {
    if (command === 'codex') throw new Error('not found');
  });

  assert.equal(results[0].success, false);
  assert.match(results[0].error.message, /not found/);
  assert.deepEqual(results[1], { toolId: 'claude', success: true });
});
