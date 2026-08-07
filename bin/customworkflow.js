#!/usr/bin/env node

import path from 'node:path';
import { installSkills, TOOLS } from '../src/init.js';
import { installFigmaMcp, selectFigmaMcpInstallation } from '../src/ui/figma-mcp.js';
import {
  installLarkCli,
  isLarkCliInstalled,
  loginLarkCli,
  selectLarkCliInstallation,
} from '../src/ui/lark-cli.js';
import { showWelcomeScreen } from '../src/ui/welcome-screen.js';
import { selectTools } from '../src/ui/tool-select.js';

const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

const [command, ...args] = process.argv.slice(2);
const nonInteractive = args.includes('--no-interactive');
const skipFigmaMcp = args.includes('--skip-figma-mcp');
const skipLarkCli = args.includes('--skip-lark-cli');
const targetPath = args.find((arg) => !arg.startsWith('--')) ?? process.cwd();

if (command === '--help' || command === '-h') {
  console.log('Usage: customworkflow install [target-path] [--no-interactive] [--skip-figma-mcp] [--skip-lark-cli]');
  console.log('       customworkflow init [target-path] [--no-interactive] [--skip-figma-mcp] [--skip-lark-cli]');
} else if (command !== 'install' && command !== 'init') {
  console.error('Usage: customworkflow install [target-path] [--no-interactive] [--skip-figma-mcp] [--skip-lark-cli]');
  process.exitCode = 1;
} else {
  try {
    const selectedTools = nonInteractive
      ? TOOLS.map((tool) => tool.id)
      : (await showWelcomeScreen(), await selectTools(TOOLS));
    if (selectedTools.length === 0) throw new Error('Select at least one tool');
    const installedFiles = await installSkills(path.resolve(targetPath), selectedTools);
    console.log(`Installed ${installedFiles.length} files:`);
    for (const file of installedFiles) console.log(`  ${file}`);
    console.log(
      `${bold(cyan('spec 约束'))}: 已写入 .customworkflow/spec/，并同步已有 openspec/specs/；` +
        `${selectedTools.includes('claude') ? 'Claude 通过 PreToolUse hook 强制注入；' : ''}` +
        `${selectedTools.includes('codex') ? 'Codex 通过 SessionStart hook 注入 soul + AGENTS.md 引导（首次需在 Codex 中信任该 hook）。' : ''}`
    );

    const shouldInstallFigmaMcp = !skipFigmaMcp && (nonInteractive || await selectFigmaMcpInstallation());
    if (shouldInstallFigmaMcp) {
      console.log('Installing Figma MCP integration...');
      const mcpResults = await installFigmaMcp(selectedTools);
      for (const result of mcpResults) {
        const toolName = bold(cyan(result.toolId));
        if (result.success) console.log(`  ${toolName}: Figma MCP installed`);
        else console.warn(`  ${toolName}: Figma MCP installation failed (${result.error.message})`);
      }
    } else if (!skipFigmaMcp) {
      console.log('Skipped Figma MCP installation.');
    }

    if (!skipLarkCli) {
      if (await isLarkCliInstalled()) {
        console.log(`  ${bold(cyan('lark-cli'))}: already installed`);
      } else {
        const shouldInstallLarkCli = nonInteractive || await selectLarkCliInstallation();
        if (shouldInstallLarkCli) {
          console.log('Installing Lark CLI...');
          try {
            await installLarkCli();
            console.log(`  ${bold(cyan('lark-cli'))}: installed`);
            console.log('Starting Lark CLI login...');
            await loginLarkCli();
            console.log(`  ${bold(cyan('lark-cli'))}: logged in`);
          } catch (error) {
            console.warn(`  ${bold(cyan('lark-cli'))}: setup failed (${error.message})`);
          }
        } else {
          console.log('Skipped Lark CLI installation.');
        }
      }
    }
  } catch (error) {
    console.error(`Failed to install CustomWorkFlow skills: ${error.message}`);
    process.exitCode = 1;
  }
}
