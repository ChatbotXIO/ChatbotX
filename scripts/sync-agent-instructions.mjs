import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const shouldWrite = process.argv.includes("--write")
const shouldCheck = process.argv.includes("--check")

if (shouldWrite === shouldCheck) {
  console.error(
    "Usage: node scripts/sync-agent-instructions.mjs --write|--check",
  )
  process.exit(1)
}

const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const markerPair = (name) => ({
  begin: `<!-- BEGIN GENERATED: ${name} -->`,
  end: `<!-- END GENERATED: ${name} -->`,
})

const extractMarkedSection = (content, name) => {
  const { begin, end } = markerPair(name)
  const pattern = new RegExp(
    `${escapeRegExp(begin)}\\n([\\s\\S]*?)\\n${escapeRegExp(end)}`,
    "g",
  )
  const matches = [...content.matchAll(pattern)]

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${name} marker pair in the source file`,
    )
  }

  return matches[0][1].trim()
}

const replaceMarkedSection = (content, name, replacement) => {
  const { begin, end } = markerPair(name)
  const pattern = new RegExp(
    `${escapeRegExp(begin)}\\n[\\s\\S]*?\\n${escapeRegExp(end)}`,
    "g",
  )
  const matches = content.match(pattern)

  if (matches?.length !== 1) {
    throw new Error(`Expected exactly one ${name} marker pair in a target file`)
  }

  return content.replace(pattern, `${begin}\n${replacement.trim()}\n${end}`)
}

const updateFile = async (relativePath, updates) => {
  const current = await read(relativePath)
  const expected = updates.reduce(
    (content, { name, replacement }) =>
      replaceMarkedSection(content, name, replacement),
    current,
  )

  if (current === expected) {
    return
  }

  if (shouldCheck) {
    throw new Error(`${relativePath} is out of sync`)
  }

  await writeFile(path.join(root, relativePath), expected)
  console.log(`Updated ${relativePath}`)
}

const main = async () => {
  const agents = await read("AGENTS.md")
  const invariants = extractMarkedSection(agents, "SHARED-INVARIANTS")
  const gitRules = await read(".agents/rules/git.md")

  await updateFile(".devin/rules/chatbotx.md", [
    { name: "SHARED-INVARIANTS", replacement: invariants },
  ])
  await updateFile(".devin/rules/git.md", [
    { name: "GIT-RULE", replacement: gitRules },
  ])
  await updateFile(".github/copilot-instructions.md", [
    { name: "SHARED-INVARIANTS", replacement: invariants },
  ])
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
