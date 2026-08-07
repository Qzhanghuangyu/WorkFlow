const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

/**
 * Selects from the two CustomWorkFlow-supported agent tools.
 * Space toggles the active item, arrows move, Enter confirms.
 */
export async function selectTools(tools) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return tools.map((tool) => tool.id);

  let cursor = 0;
  let selected = new Set(tools.map((tool) => tool.id));
  const render = () => {
    const rows = tools.map((tool, index) => {
      const pointer = index === cursor ? cyan('›') : ' ';
      const checked = selected.has(tool.id) ? cyan('◉') : dim('○');
      return `  ${pointer} ${checked} ${tool.name}`;
    });
    return [
      bold(cyan('Select tools to set up (2 available)')),
      ...rows,
      dim('  ↑↓ navigate • Space toggle • Enter confirm'),
    ];
  };

  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    let renderedLines = 0;
    const repaint = () => {
      // Rendering leaves the cursor on the last line. Return to the first
      // line, then clear every line before writing the next complete frame.
      // `\r` is essential: CSI 2K clears a line but does not reset its column.
      if (renderedLines) process.stdout.write(`\x1b[${renderedLines - 1}A\r`);
      const lines = render();
      process.stdout.write(lines.map((line) => `\r\x1b[2K${line}`).join('\n'));
      renderedLines = lines.length;
    };
    const done = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(tools.filter((tool) => selected.has(tool.id)).map((tool) => tool.id));
    };
    const onData = (data) => {
      const key = data.toString();
      if (key === '\u0003') process.exit(0);
      if (key === '\r' || key === '\n') return done();
      if (key === ' ') {
        const id = tools[cursor].id;
        selected.has(id) ? selected.delete(id) : selected.add(id);
      } else if (key === '\x1b[A') cursor = Math.max(0, cursor - 1);
      else if (key === '\x1b[B') cursor = Math.min(tools.length - 1, cursor + 1);
      repaint();
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    repaint();
    process.stdin.on('data', onData);
  });
}
