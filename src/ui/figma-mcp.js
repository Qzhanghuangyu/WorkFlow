import { spawn } from 'node:child_process';

const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

const FIGMA_MCP_COMMANDS = {
  codex: {
    command: 'codex',
    args: ['mcp', 'add', 'figma', '--url', 'https://mcp.figma.com/mcp'],
  },
  claude: {
    command: 'claude',
    args: ['plugin', 'install', 'figma@claude-plugins-official'],
  },
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/** Prompts whether the selected agent CLIs should receive the Figma MCP integration. */
export async function selectFigmaMcpInstallation() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;

  const options = [
    { label: 'Install Figma MCP(推荐)', value: true },
    { label: 'Skip for now', value: false },
  ];
  let cursor = 0;

  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    let renderedLines = 0;
    const repaint = () => {
      if (renderedLines) process.stdout.write(`\x1b[${renderedLines - 1}A\r`);
      const lines = [
        '',
        bold(cyan('Install Figma MCP for the selected tools?')),
        ...options.map((option, index) => {
          const checked = index === cursor ? cyan('◉') : dim('○');
          return `  ${checked} ${option.label}`;
        }),
        dim('  ↑↓ navigate • Enter confirm'),
      ];
      process.stdout.write(lines.map((line) => `\r\x1b[2K${line}`).join('\n'));
      renderedLines = lines.length;
    };
    const done = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(options[cursor].value);
    };
    const onData = (data) => {
      const key = data.toString();
      if (key === '\u0003') process.exit(0);
      if (key === '\r' || key === '\n') return done();
      if (key === '\x1b[A') cursor = Math.max(0, cursor - 1);
      else if (key === '\x1b[B') cursor = Math.min(options.length - 1, cursor + 1);
      repaint();
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    repaint();
    process.stdin.on('data', onData);
  });
}

/** Installs the official Figma MCP integration for the selected agent CLIs. */
export async function installFigmaMcp(toolIds, commandRunner = run) {
  const results = [];
  for (const toolId of toolIds) {
    const config = FIGMA_MCP_COMMANDS[toolId];
    if (!config) throw new Error(`Unknown tool '${toolId}'. Valid tools: claude, codex`);

    try {
      await commandRunner(config.command, config.args);
      results.push({ toolId, success: true });
    } catch (error) {
      results.push({ toolId, success: false, error });
    }
  }
  return results;
}
