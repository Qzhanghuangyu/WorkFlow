const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

const FRAME_TEMPLATE = [
  '        ·        ',
  '    ·       ·    ',
  '  ·    ╭─╮    ·  ',
  ' ·     │◆│     · ',
  '  ·    ╰─╯    ·  ',
  '    ·       ·    ',
  '        ·        ',
];

const ORBIT_POINTS = [
  [0, 8],
  [1, 12],
  [2, 14],
  [3, 15],
  [4, 14],
  [5, 12],
  [6, 8],
  [5, 4],
  [4, 2],
  [3, 1],
  [2, 2],
  [1, 4],
];

const FRAMES = ORBIT_POINTS.map(([activeRow, activeColumn]) =>
  FRAME_TEMPLATE.map((line, row) => {
    if (row !== activeRow) return line;
    const characters = [...line];
    characters[activeColumn] = '●';
    return characters.join('');
  })
);

function textLines() {
  return [
    bold('Welcome to FallaMercury'),
    dim('Project skill setup'),
    '',
    'This setup will configure:',
    dim('  • Agent Skills for AI tools'),
    '',
    dim('Choose Claude Code and/or Codex next.'),
    '',
    cyan('Press Enter to select tools...'),
  ];
}

function renderFrame(frame, lines) {
  const height = Math.max(frame.length, lines.length);
  return Array.from({ length: height }, (_, index) =>
    `\x1b[2K${cyan((frame[index] ?? '').padEnd(24))}${lines[index] ?? ''}`
  ).join('\n');
}

function canAnimate() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR && (process.stdout.columns ?? 80) >= 60);
}

function waitForEnter() {
  if (!process.stdin.isTTY) return Promise.resolve();
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (data) => {
      const key = data.toString();
      if (key !== '\r' && key !== '\n' && key !== '\u0003') return;
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      if (key === '\u0003') process.exit(0);
      resolve();
    };
    process.stdin.on('data', onData);
  });
}

/** Displays the OpenSpec-style animated init welcome screen. */
export async function showWelcomeScreen() {
  const lines = textLines();
  if (!canAnimate()) {
    process.stdout.write(`\n${renderFrame(FRAMES.at(-1), lines)}\n\n`);
    return;
  }

  // `renderFrame` writes one newline between each content line and the extra
  // trailing blank line below. Move back exactly that many terminal rows on
  // each tick; one extra row makes successive frames append instead of redraw.
  const height = Math.max(FRAMES[0].length, lines.length) + 1;
  let firstRender = true;
  let index = 0;
  const interval = setInterval(() => {
    if (!firstRender) process.stdout.write(`\x1b[${height}A`);
    firstRender = false;
    process.stdout.write(`${renderFrame(FRAMES[index], lines)}\n\n`);
    index = (index + 1) % FRAMES.length;
  }, 120);

  await waitForEnter();
  clearInterval(interval);
  process.stdout.write(`\x1b[${height}A${'\x1b[2K\n'.repeat(height)}\x1b[${height}A`);
}
