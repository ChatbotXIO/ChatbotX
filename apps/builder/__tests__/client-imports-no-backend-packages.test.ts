// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import ts from "typescript"
import { describe, expect, test } from "vitest"

const APP_ROOT = join(import.meta.dirname, "..")
const SRC_ROOT = join(APP_ROOT, "src")
const TS_LIKE_EXTENSION_PATTERN = /\.(ts|tsx)$/
const USE_CLIENT_DIRECTIVE_PATTERN = /^["']use client["']\s*;?\s*$/
const USE_SERVER_DIRECTIVE_PATTERN = /^["']use server["']\s*;?\s*$/
// The bare package barrel (`@chatbotx.io/business/src/index.ts`) is a
// 100+ line `export *` that reaches every service in the product, including
// the Postgres pool and Redis client (see media-library-file/service.ts ->
// base.service.ts -> @chatbotx.io/redis, and platform/settings.ts ->
// @chatbotx.io/database/client, which opens a `pg` Pool at module scope).
// A subpath export (`@chatbotx.io/business/inbox/schema`, etc.) points at a
// single leaf file and is allowed — see package.json `exports` for the
// package's own allowlist of client-safe leaves.
const BACKEND_PACKAGE_BARREL_SPECIFIER = "@chatbotx.io/business"

/**
 * Not every `@chatbotx.io/*` package is backend-only, and not every backend
 * package's main barrel is unsafe — this guard only encodes the one
 * confirmed-unsafe barrel exercised by this bug (media-library/schema.ts).
 * Extend this set only after confirming a barrel actually reaches DB/queue
 * clients, the way `@chatbotx.io/business`'s does.
 */
const DENYLISTED_BARREL_SPECIFIERS = new Set([BACKEND_PACKAGE_BARREL_SPECIFIER])

function collectSourceFiles(dir: string, results: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") {
      continue
    }

    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, results)
    } else if (TS_LIKE_EXTENSION_PATTERN.test(entry)) {
      results.push(fullPath)
    }
  }

  return results
}

function isClientFile(source: string) {
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("//")) {
      continue
    }
    return USE_CLIENT_DIRECTIVE_PATTERN.test(trimmed)
  }
  return false
}

/**
 * True if the file's leading directive is "use server". Next.js compiles
 * every export of such a file into a server-only reference: a "use client"
 * component may call it, but the call is an RPC over the network — the
 * module body (and everything it imports) never enters the client bundle.
 * Reaching a "use server" file therefore ends the walk rather than
 * continuing to flag its imports as client-bundle exposure.
 */
function isServerFile(source: string) {
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("//")) {
      continue
    }
    return USE_SERVER_DIRECTIVE_PATTERN.test(trimmed)
  }
  return false
}

const RESOLVE_CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  "/index.ts",
  "/index.tsx",
]

/** Resolves a relative or `@/`-aliased specifier to a file under SRC_ROOT, if one exists. */
function resolveModuleSpecifier(importingFilePath: string, specifier: string) {
  const basePath = specifier.startsWith("@/")
    ? join(SRC_ROOT, specifier.slice(2))
    : join(dirname(importingFilePath), specifier)

  for (const suffix of RESOLVE_CANDIDATE_SUFFIXES) {
    const candidate = `${basePath}${suffix}`
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate
    }
  }
  return null
}

function isFirstPartySpecifier(specifier: string) {
  return specifier.startsWith(".") || specifier.startsWith("@/")
}

/** True if this import/export clause pulls in at least one runtime value. */
function hasValueBinding(
  clause: ts.ImportClause | undefined,
): clause is ts.ImportClause {
  if (!clause) {
    return false
  }
  if (clause.isTypeOnly) {
    return false
  }
  if (clause.name) {
    // default import, e.g. `import Foo from "..."`
    return true
  }
  const bindings = clause.namedBindings
  if (!bindings) {
    return false
  }
  if (ts.isNamespaceImport(bindings)) {
    // `import * as foo from "..."`
    return true
  }
  // named imports: `{ a, type B }` — a value import unless every element is type-only
  return bindings.elements.some((el) => !el.isTypeOnly)
}

/** True if this re-export clause (`export { a } from "..."`) pulls in at least one runtime value. */
function hasValueExportBinding(
  clause: ts.NamedExportBindings | undefined,
  isTypeOnlyExport: boolean,
): boolean {
  if (isTypeOnlyExport) {
    return false
  }
  if (!clause) {
    // `export * from "..."` — always a value re-export.
    return true
  }
  if (ts.isNamespaceExport(clause)) {
    return true
  }
  return clause.elements.some((el) => !el.isTypeOnly)
}

type ModuleSpecifierRef = {
  specifier: string
  isValue: boolean
}

/** Every import/re-export module specifier in a file, with whether it carries a runtime value. */
function findModuleSpecifierRefs(
  filePath: string,
  source: string,
): ModuleSpecifierRef[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const refs: ModuleSpecifierRef[] = []

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        continue
      }
      refs.push({
        specifier: statement.moduleSpecifier.text,
        isValue: hasValueBinding(statement.importClause),
      })
    } else if (ts.isExportDeclaration(statement)) {
      if (
        !(
          statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier)
        )
      ) {
        continue
      }
      refs.push({
        specifier: statement.moduleSpecifier.text,
        isValue: hasValueExportBinding(
          statement.exportClause,
          statement.isTypeOnly,
        ),
      })
    }
  }

  return refs
}

/**
 * Whether `filePath` reaches a denylisted backend-package barrel through a
 * chain of runtime-value imports/re-exports across first-party modules
 * (relative or `@/`-aliased). Stops at the first non-first-party specifier:
 * if it is denylisted, this is a violation; otherwise it's an ordinary
 * (allowed) package import and the chain ends there.
 */
function reachesDenylistedBarrel(
  filePath: string,
  source: string,
  visited: Set<string>,
): string | null {
  if (visited.has(filePath)) {
    return null
  }
  visited.add(filePath)

  for (const ref of findModuleSpecifierRefs(filePath, source)) {
    if (!ref.isValue) {
      continue
    }

    if (!isFirstPartySpecifier(ref.specifier)) {
      if (DENYLISTED_BARREL_SPECIFIERS.has(ref.specifier)) {
        return ref.specifier
      }
      continue
    }

    const resolved = resolveModuleSpecifier(filePath, ref.specifier)
    if (!resolved) {
      continue
    }

    const nestedSource = readFileSync(resolved, "utf8")
    if (isServerFile(nestedSource)) {
      // A "use server" boundary: its exports are network-invokable RPC
      // references from the client's point of view, not inlined module code,
      // so its own imports never reach the client bundle. Stop here.
      continue
    }
    const hit = reachesDenylistedBarrel(resolved, nestedSource, visited)
    if (hit) {
      return hit
    }
  }

  return null
}

describe("client components do not reach denylisted backend package barrels", () => {
  test('no "use client" file value-imports (even transitively, through first-party re-exports) a denylisted backend barrel', () => {
    const offenders = collectSourceFiles(SRC_ROOT).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8")
      if (!isClientFile(source)) {
        return []
      }

      const hit = reachesDenylistedBarrel(filePath, source, new Set())
      return hit ? [`${filePath} -> "${hit}"`] : []
    })

    expect(offenders).toEqual([])
  })
})
