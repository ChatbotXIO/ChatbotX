import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Enforces the mechanical AGENTS.md invariants that Biome cannot express.
 *
 * Each check here used to live only as prose an agent had to remember. A rule a
 * script can verify belongs in `pnpm lint`, not in the always-loaded context.
 * The direct-`db` import ban lives in `biome.json` (`noRestrictedImports`).
 */

const root = process.cwd()

const TSDOWN_ROOTS = [
  "packages/",
  "integrations/",
  "apps/worker/",
  "apps/cli/",
  "apps/mcp-server/",
  "apps/javascript-executor/",
]
const SERVER_ROOTS = ["apps/", "packages/", "integrations/"]
const RELATIONS_INDEX = "packages/database/src/relations/index.ts"

// Legacy runtime dynamic imports kept on purpose; never add to this list.
const DYNAMIC_IMPORT_ALLOWLIST = new Set([
  // Loads AsyncLocalStorage lazily so the module still imports on the Edge Runtime.
  "packages/events/src/trigger/context.ts",
])

const SOURCE_FILE = /\.(ts|tsx|mts|cts)$/
const TEST_PATH = /(^|\/)__tests__\/|\.(test|spec)\.tsx?$/
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/
const RUNTIME_DYNAMIC_IMPORT =
  /(\bawait\s+import\(|=>\s*import\(|\bimport\([^)]*\)\s*\.then\b)/
const LOGGER_ERROR_KEY =
  /\.(fatal|error|warn|info|debug|trace)\(\s*\{\s*error\s*[,}]/
const PRISMA_IMPORT = /from\s+["']@prisma\//
const RELATIONS_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']\.\/[^"']+["']/g

const violations = []
const report = (file, line, message) =>
  violations.push({ location: line ? `${file}:${line}` : file, message })

const listTrackedSources = () =>
  execFileSync("git", ["ls-files", "-z", "apps", "packages", "integrations"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((file) => SOURCE_FILE.test(file) && !TEST_PATH.test(file))

const startsWithAny = (file, prefixes) =>
  prefixes.some((prefix) => file.startsWith(prefix))

const checkLines = (file, lines) => {
  const isTsdown = startsWithAny(file, TSDOWN_ROOTS)
  const isServer = startsWithAny(file, SERVER_ROOTS)

  lines.forEach((text, index) => {
    if (COMMENT_LINE.test(text)) {
      return
    }

    const line = index + 1

    if (
      isTsdown &&
      !DYNAMIC_IMPORT_ALLOWLIST.has(file) &&
      RUNTIME_DYNAMIC_IMPORT.test(text)
    ) {
      report(
        file,
        line,
        "dynamic import() breaks the tsdown build; use a static import (.agents/rules/no-dynamic-import.md)",
      )
    }

    if (isServer && LOGGER_ERROR_KEY.test(text)) {
      report(
        file,
        line,
        "log the error under `err`, not `error`, or pino drops the stack trace (AGENTS.md invariant 20)",
      )
    }

    if (PRISMA_IMPORT.test(text)) {
      report(
        file,
        line,
        "this project uses Drizzle only, never Prisma (AGENTS.md invariant 8)",
      )
    }
  })
}

// A relations file that is imported but never spread into the `relations`
// object silently breaks Drizzle relational queries (AGENTS.md invariant 2).
const checkRelationsIndex = async () => {
  const content = await readFile(path.join(root, RELATIONS_INDEX), "utf8")
  const importedNames = [...content.matchAll(RELATIONS_IMPORT)].flatMap(
    (match) =>
      match[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
  )

  for (const name of importedNames) {
    const uses = content.match(new RegExp(`\\b${name}\\b`, "g")) ?? []

    if (uses.length < 2) {
      report(
        RELATIONS_INDEX,
        null,
        `\`${name}\` is imported but not added to the relations object`,
      )
    }
  }
}

const main = async () => {
  const files = listTrackedSources()

  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8")
    checkLines(file, content.split("\n"))
  }

  await checkRelationsIndex()

  if (violations.length > 0) {
    console.error(`Invariant check failed (${violations.length} problem(s)):`)

    for (const { location, message } of violations) {
      console.error(`  ${location}: ${message}`)
    }

    process.exit(1)
  }

  console.log(`Checked ${files.length} source files — invariants hold`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
