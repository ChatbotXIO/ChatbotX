#!/bin/sh
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)
PATTERN='^(feat|fix|bugfix|refactor|docs|style|test|chore|ci|perf|build|revert)/.+'
# Skip checks for detached HEAD, main, master, develop, release, and bot-generated branches
if echo "$BRANCH" | grep -qE '^(main|master|develop|HEAD|release/.+|dependabot/.+|renovate/.+)$'; then
  exit 0
fi
if ! echo "$BRANCH" | grep -qE "$PATTERN"; then
  echo "❌ Invalid branch name: '$BRANCH'"
  echo ""
  echo "Expected: <type>/<description>"
  echo "  Types: feat, fix, bugfix, refactor, docs, style, test, chore, ci, perf, build, revert"
  echo "  Example: feat/instagram-channel"
  echo "  Example: fix/whatsapp-webhook"
  echo ""
  echo "Rename it with: git branch -m <new-name>"
  exit 1
fi
