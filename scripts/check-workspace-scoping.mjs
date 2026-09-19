import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

/**
 * Workspace-isolation ratchet.
 *
 * Every repository under `packages/database/src/repositories` is trusted, by
 * convention, to filter by `workspaceId` whenever a caller passes one in —
 * there is no Postgres Row-Level Security backing this (see
 * docs/adr/0003-workspace-isolation-strategy.md). A repository function that
 * accepts a `workspaceId` parameter but never references it in its body is a
 * strong signal that filter got dropped, and a real cross-workspace leak.
 *
 * This is a heuristic static scan, not a proof: it flags a function as a
 * violation when its body's source text never mentions the `workspaceId`
 * identifier inside anything that looks like a `where(`/`eq(`/`and(` call.
 * It is deliberately loose (a function that only uses `workspaceId` for a
 * cache key, not a filter, still counts as "referenced") because the goal is
 * catching the "declared but silently ignored" failure mode, not modeling
 * Drizzle's query builder.
 *
 * New violations fail CI. Existing ones are frozen in
 * `check-workspace-scoping.allowlist.json` (regenerate it with `--update`
 * after a deliberate change) so this ships as a ratchet, not a blocking
 * rewrite of every repository in one PR.
 */

const REPOSITORIES_DIR = "packages/database/src/repositories"
const ALLOWLIST_PATH = new URL(
  "./check-workspace-scoping.allowlist.json",
  import.meta.url,
)
const SCOPING_CALL_PATTERN = /\b(where|eq|and)\s*\(/

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)))
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath)
    }
  }
  return files
}

/**
 * Textual tokens that count as "this parameter's workspaceId got used" in
 * the function body:
 *  - a plain `workspaceId` parameter, or a destructured `{ workspaceId }`
 *    element, is referenced as the bare identifier `workspaceId`;
 *  - a parameter typed inline as `{ workspaceId: string; ... }` without
 *    destructuring (the dominant style in this codebase, e.g.
 *    `findPublicById(input: { workspaceId: string; id: string })`) is
 *    referenced as `<paramName>.workspaceId` — destructuring it locally
 *    inside the body (`const { workspaceId } = input`) also produces the
 *    bare identifier, so both tokens are checked regardless of which type
 *    annotation shape matched.
 */
function collectWorkspaceIdAccessTokens(param) {
  if (ts.isIdentifier(param.name)) {
    if (param.name.text === "workspaceId") {
      return ["workspaceId"]
    }
    const hasWorkspaceIdProperty =
      param.type &&
      ts.isTypeLiteralNode(param.type) &&
      param.type.members.some(
        (member) => member.name && member.name.getText() === "workspaceId",
      )
    return hasWorkspaceIdProperty
      ? [`${param.name.text}.workspaceId`, "workspaceId"]
      : []
  }
  if (ts.isObjectBindingPattern(param.name)) {
    const hasWorkspaceId = param.name.elements.some(
      (element) =>
        ts.isIdentifier(element.name) && element.name.text === "workspaceId",
    )
    return hasWorkspaceId ? ["workspaceId"] : []
  }
  return []
}

function findViolations(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const violations = []

  function checkFunctionLike(node, label) {
    if (!node.body) {
      return
    }
    const tokens = node.parameters.flatMap((param) =>
      collectWorkspaceIdAccessTokens(param),
    )
    if (tokens.length === 0) {
      return
    }

    const bodyText = node.body.getText(sourceFile)
    const referencesWorkspaceId = tokens.some((token) =>
      bodyText.includes(token),
    )
    const looksLikeAQuery = SCOPING_CALL_PATTERN.test(bodyText)

    if (looksLikeAQuery && !referencesWorkspaceId) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      // The allowlist key deliberately excludes the line number: an edit
      // above a flagged function would otherwise shift its line and make
      // the entry silently "resolve" and reappear as a false new violation.
      violations.push({
        key: `${filePath} ${label}`,
        display: `${filePath}:${line + 1} ${label}`,
      })
    }
  }

  function visit(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name
    ) {
      checkFunctionLike(node, node.name.getText(sourceFile))
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      checkFunctionLike(node.initializer, node.name.getText(sourceFile))
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)) &&
      ts.isIdentifier(node.name)
    ) {
      checkFunctionLike(node.initializer, node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

async function loadAllowlist() {
  try {
    const raw = await readFile(ALLOWLIST_PATH, "utf8")
    return new Set(JSON.parse(raw))
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set()
    }
    throw error
  }
}

async function main() {
  const update = process.argv.includes("--update")
  const root = process.cwd()
  const repositoriesDir = path.join(root, REPOSITORIES_DIR)
  const files = await collectSourceFiles(repositoriesDir)

  const violations = []
  for (const file of files) {
    const relativePath = path.relative(root, file)
    const sourceText = await readFile(file, "utf8")
    violations.push(...findViolations(relativePath, sourceText))
  }
  violations.sort((a, b) => a.key.localeCompare(b.key))

  if (update) {
    const keys = violations.map((v) => v.key)
    await writeFile(ALLOWLIST_PATH, `${JSON.stringify(keys, null, 2)}\n`)
    console.log(
      `Wrote ${keys.length} baseline violation(s) to ${path.relative(root, ALLOWLIST_PATH.pathname)}`,
    )
    return
  }

  const allowlist = await loadAllowlist()
  const currentKeys = new Set(violations.map((v) => v.key))
  const newViolations = violations.filter((v) => !allowlist.has(v.key))
  const resolved = [...allowlist].filter((key) => !currentKeys.has(key))

  if (resolved.length > 0) {
    console.log(
      `${resolved.length} previously-allowlisted violation(s) no longer reproduce — run with --update to shrink the baseline:`,
    )
    for (const entry of resolved) {
      console.log(`  - ${entry}`)
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `Found ${newViolations.length} new function(s) that take a workspaceId but never reference it in a where/eq/and call:`,
    )
    for (const violation of newViolations) {
      console.error(`  - ${violation.display}`)
    }
    console.error(
      "\nIf this is a real bug, add the missing workspaceId filter. If it's a false positive, add it to " +
        "scripts/check-workspace-scoping.allowlist.json (or run this script with --update) with a comment " +
        "explaining why.",
    )
    process.exitCode = 1
    return
  }

  console.log(
    `Workspace-scoping check passed: ${violations.length} known violation(s), 0 new.`,
  )
}

await main()
