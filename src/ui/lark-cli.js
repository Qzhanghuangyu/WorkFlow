import { spawn } from 'node:child_process';

const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

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

function check(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/** Returns whether lark-cli is already available in the current PATH. */
export async function isLarkCliInstalled(commandRunner = check) {
  try {
    await commandRunner('lark-cli', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Prompts whether the Lark CLI should be installed. */
export async function selectLarkCliInstallation() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return true;

  const options = [
    { label: 'Install Lark CLI(推荐)', value: true },
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
        bold(cyan('Install Lark CLI?')),
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

/** Installs the Lark CLI. */
export function installLarkCli(commandRunner = run) {
  return commandRunner('npx', ['@larksuite/cli@latest', 'install']);
}

/** Opens the interactive Lark CLI login flow. */
export function loginLarkCli(commandRunner = run) {
  return commandRunner('lark-cli', ['auth', 'login']);
}
