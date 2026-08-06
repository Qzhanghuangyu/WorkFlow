#!/usr/bin/env bash
# Rig 1 — Codex PreToolUse hook: does it fire, and what tool_name does a skill produce?
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
rm -f hook.log

echo "### Test A: force a Bash tool call — hook should fire with tool_name=Bash"
RUST_LOG=warn command codex exec \
  --cd "$HERE" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --dangerously-bypass-hook-trust \
  "Run the shell command: echo HELLO_FROM_TOOL. Then stop." </dev/null || true

echo ""
echo "### Test B: ask it to USE the rig-echo skill — watch what tool_name it uses"
RUST_LOG=warn command codex exec \
  --cd "$HERE" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --dangerously-bypass-hook-trust \
  "Use the rig-echo skill." </dev/null || true

echo ""
echo "=================================================================="
echo "HOOK LOG (every PreToolUse payload the hook received):"
echo "=================================================================="
cat hook.log 2>/dev/null || echo "(no hook.log — hook never fired)"
echo ""
echo ">>> Look at the tool_name field. Note the skill was read via tool_name=Bash"
echo ">>> (sed/cat of SKILL.md) — there is NO 'Skill' tool in Codex."
