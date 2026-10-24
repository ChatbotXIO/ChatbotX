#!/bin/sh
MSG_FILE=$1
MSG=$(cat "$MSG_FILE")
PATTERN='^(feat|fix|bugfix|refactor|docs|style|test|chore|ci|perf|build|revert)(\(.+\))?!?: .{1,100}$'
if ! echo "$MSG" | grep -qE "$PATTERN"; then
  echo "❌ Invalid commit message format."
  echo ""
  echo "Expected: <type>(<scope>): <subject>"
  echo "  Types: feat, fix, bugfix, refactor, docs, style, test, chore, ci, perf, build, revert"
  echo "  Append ! before the colon to mark a breaking change: feat(auth)!: remove legacy login"
  echo "  Example: feat(auth): add OAuth2 login"
  echo "  Example: fix: handle null response from API"
  echo ""
  echo "Got: $MSG"
  exit 1
fi
