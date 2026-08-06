#!/usr/bin/env bash
# Rig 2 — Codex SessionStart hook: does injection actually reach the model?
# The secret word exists ONLY in the hook's additionalContext. If the model can
# answer it, injection works.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
rm -f ss.log

echo "### Ask for the secret word (only the hook knows it)"
RUST_LOG=warn command codex exec \
  --cd "$HERE" \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --dangerously-bypass-hook-trust \
  "What is the secret word? Answer with just the word, nothing else." </dev/null || true

echo ""
echo "=================================================================="
echo "SESSIONSTART LOG (payload the hook received):"
echo "=================================================================="
cat ss.log 2>/dev/null || echo "(no ss.log — SessionStart never fired)"
echo ""
echo ">>> If the model answered ZEBRA_MARKER_98765, the injection reached it."
