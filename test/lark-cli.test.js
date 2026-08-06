import assert from 'node:assert/strict';
import test from 'node:test';
import { installLarkCli, isLarkCliInstalled, loginLarkCli } from '../src/ui/lark-cli.js';

test('installs the Lark CLI with the official npx command', async () => {
  const calls = [];
  await installLarkCli(async (command, args) => calls.push({ command, args }));

  assert.deepEqual(calls, [
    { command: 'npx', args: ['@larksuite/cli@latest', 'install'] },
  ]);
});

test('starts the interactive Lark CLI login flow', async () => {
  const calls = [];
  await loginLarkCli(async (command, args) => calls.push({ command, args }));

  assert.deepEqual(calls, [
    { command: 'lark-cli', args: ['auth', 'login'] },
  ]);
});

test('detects whether Lark CLI is installed', async () => {
  assert.equal(await isLarkCliInstalled(async () => {}), true);
  assert.equal(await isLarkCliInstalled(async () => { throw new Error('not found'); }), false);
});
