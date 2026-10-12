#!/usr/bin/env node
/**
 * PreToolUse hook for the Bash tool: blocks git commands that destroy work or
 * break the staging rule in `.agents/rules/git.md`. Exit code 2 blocks the
 * call and shows stderr to the agent.
 *
 * Test: echo '{"tool_input":{"command":"git reset --hard"}}' | node .claude/hooks/block-dangerous-git.mjs
 */

const GIT = String.raw`\bgit(?:\s+-C\s+\S+)?\s+`
const END = String.raw`(?=\s|$|;|&|\|)`

const BLOCKED = [
  {
    pattern: new RegExp(`${GIT}push\\b[^;&|]*\\s(?:--force|-f)${END}`),
    reason:
      "force push rewrites the remote branch; use --force-with-lease if you must",
  },
  {
    pattern: new RegExp(`${GIT}reset\\b[^;&|]*\\s--hard${END}`),
    reason: "reset --hard discards uncommitted work",
  },
  {
    pattern: new RegExp(`${GIT}clean\\b[^;&|]*\\s-[a-zA-Z]*f`),
    reason: "clean -f deletes untracked files permanently",
  },
  {
    pattern: new RegExp(`${GIT}branch\\b[^;&|]*\\s-D${END}`),
    reason: "branch -D deletes a branch even when it is not merged",
  },
  {
    pattern: new RegExp(`${GIT}(?:checkout|restore)\\s+(?:--\\s+)?\\.${END}`),
    reason: "this discards every unstaged change in the working tree",
  },
  {
    pattern: new RegExp(`${GIT}add\\s+(?:-A|--all|\\.)${END}`),
    reason:
      "stage specific files only (.agents/rules/git.md); list the paths to add",
  },
]

const readStdin = async () => {
  let input = ""
  for await (const chunk of process.stdin) {
    input += chunk
  }
  return input
}

const main = async () => {
  let command = ""

  try {
    command = JSON.parse(await readStdin())?.tool_input?.command ?? ""
  } catch {
    process.exit(0)
  }

  const hit = BLOCKED.find(({ pattern }) => pattern.test(command))

  if (hit) {
    process.stderr.write(
      `BLOCKED by .claude/hooks/block-dangerous-git.mjs: ${hit.reason}.\nAsk the user to run this command themselves if it is really needed.\n`,
    )
    process.exit(2)
  }
}

await main()
