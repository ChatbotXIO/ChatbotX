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
// Matches a relative or `@/features/<feature>` specifier whose last path
// segment is exactly `queries`, or a direct file inside such a directory
// (e.g. `../queries`, `./queries/files`, `@/features/tags/queries`) — the
// `apps/builder/src/features/*/queries/` request-adapter modules described
// in .agents/rules/data-access.md.
const QUERIES_MODULE_SPECIFIER_PATTERN =
  /^(?:\.\.?\/|@\/features\/)(?:[\w-]+\/)*queries(?:\/[\w-]+)?$/

// A `features/*/queries` module that is itself marked "use server" compiles
// into a Next.js Server Actions module: every export becomes an invokable
// server reference, reachable over the network by anyone who can guess or
// intercept its action-ID hash, bypassing the oRPC/action auth middleware
// that is supposed to gate that data (see .agents/rules/data-access.md).
// A "use client" component must reach that data through the oRPC client or
// TanStack Query instead — see media-library-trigger.tsx, which used to
// value-import `../queries/files` and `../queries/folders` directly and only
// worked because those two modules were (incorrectly) marked "use server".
//
// Not every file under `queries/` carries that risk: a plain helper with no
// "use server" directive (e.g. a pure formatting function colocated there)
// is just an ordinary module and is not flagged — only resolving the
// specifier to its actual file tells them apart from the barrel/adapter
// files that need the guard. `import type { ... }` (and `import { type Foo
// }` where every named specifier is type-only) is fine regardless; only a
// value import into a "use server" file is a boundary violation.
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

function isQueriesModuleSpecifier(specifier: string) {
  return QUERIES_MODULE_SPECIFIER_PATTERN.test(specifier)
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

/** True if the resolved file's leading directive is "use server". */
function isUseServerFile(resolvedPath: string) {
  const source = readFileSync(resolvedPath, "utf8")
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("//")) {
      continue
    }
    return USE_SERVER_DIRECTIVE_PATTERN.test(trimmed)
  }
  return false
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

function findQueriesValueImports(filePath: string, source: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const offenders: string[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }
    const specifier = statement.moduleSpecifier.text
    if (!isQueriesModuleSpecifier(specifier)) {
      continue
    }
    if (!hasValueBinding(statement.importClause)) {
      continue
    }

    const resolved = resolveModuleSpecifier(filePath, specifier)
    // A directory import (e.g. `../queries`) resolves to its `index.ts`
    // barrel, which is the adapter surface itself — flag it. An
    // unresolvable specifier is flagged conservatively rather than silently
    // skipped.
    if (!resolved || isUseServerFile(resolved)) {
      offenders.push(specifier)
    }
  }

  return offenders
}

describe("client components do not value-import features/*/queries modules", () => {
  test('no "use client" file value-imports a queries module', () => {
    const offenders = collectSourceFiles(SRC_ROOT).flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8")
      if (!isClientFile(source)) {
        return []
      }

      return findQueriesValueImports(filePath, source).map(
        (specifier) => `${filePath} -> "${specifier}"`,
      )
    })

    expect(offenders).toEqual([])
  })
})
