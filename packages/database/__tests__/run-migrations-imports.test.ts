import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * `scripts/run-migrations.mjs` is plain JavaScript that only runs inside the
 * Docker image at deploy time, so neither `tsc` nor any other test loads it.
 * It reaches into drizzle-orm subpaths that are not a stable public API: the
 * 1.0.0-rc upgrade moved `upgradeIfNeeded` to another module and every check
 * stayed green while the deploy migration crashed on import.
 *
 * This resolves each named import of the script against the installed
 * packages, which is the exact check Node does when the script starts.
 */
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "run-migrations.mjs",
)

const NAMED_IMPORT_RE = /^import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/gm
const IMPORT_ALIAS_RE = /\s+as\s+/

const readNamedImports = () => {
  const source = readFileSync(scriptPath, "utf8")
  return [...source.matchAll(NAMED_IMPORT_RE)].map(([, names, specifier]) => ({
    specifier,
    names: names
      .split(",")
      .map((name) => name.trim().split(IMPORT_ALIAS_RE)[0])
      .filter(Boolean),
  }))
}

describe("run-migrations.mjs imports", () => {
  const namedImports = readNamedImports()

  it("finds the drizzle-orm imports of the script", () => {
    const specifiers = namedImports.map(({ specifier }) => specifier)

    expect(specifiers).toContain("drizzle-orm/up-migrations/pg-program")
  })

  it.each(
    namedImports,
  )("$specifier exports every name the script imports", async ({
    specifier,
    names,
  }) => {
    const moduleExports: Record<string, unknown> = await import(specifier)

    const missing = names.filter((name) => !(name in moduleExports))

    expect(missing).toEqual([])
  })
})
