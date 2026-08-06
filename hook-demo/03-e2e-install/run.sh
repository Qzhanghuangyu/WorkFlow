#!/usr/bin/env bash
# Rig 3 — Full end-to-end: real `falla-mercury install` then real `codex exec`.
# Proves the shipped code (init.js + falla-spec-session.mjs) wires up the hook
# so soul.md reaches Codex — WITHOUT the model reading any file.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TARGET="$HERE/installed-project"

echo "### 1) Install FallaMercury skills+hooks into a fresh project"
rm -rf "$TARGET"
mkdir -p "$TARGET"
node "$REPO/bin/falla-mercury.js" install "$TARGET" \
  --no-interactive --skip-figma-mcp --skip-lark-cli

echo ""
echo "### 2) What got written for Codex"
echo "--- .codex/config.toml ---"
cat "$TARGET/.codex/config.toml"
echo "--- .codex/hooks/ ---"
ls "$TARGET/.codex/hooks/"
echo "--- .falla/spec/ ---"
ls "$TARGET/.falla/spec/"

echo ""
echo "### 3) Run codex IN the installed project and ask a fact that lives"
echo "###    ONLY in soul.md, while forbidding file reads."
cd "$TARGET"
git init -q 2>/dev/null || true
RUST_LOG=warn command codex exec \
  --cd "$TARGET" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --dangerously-bypass-hook-trust \
  "根据你会话开始时获得的 FallaMercury 约束，FallaMercury 承认 AI 在 Figma 到安卓还原上大约有百分之几无法自动对齐？只回答数字。不要读取任何文件。" </dev/null || true

echo ""
echo ">>> If the model answered 20%, the installed SessionStart hook injected"
echo ">>> soul.md into the session (it was told NOT to read files)."
