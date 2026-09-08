import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * `/rpc` is a public route in the proxy (see `lib/public-routes.ts`), so the
 * only thing standing between an anonymous request and a feature handler is
 * the auth middleware each procedure carries. Nothing type-checks that: a
 * procedure built on a raw oRPC base compiles, mounts, and answers without a
 * session.
 *
 * These tests pin the structural reason that cannot happen — `@/orpc` exports
 * no unauthenticated base, and no feature api module imports one from
 * anywhere else.
 */

const BUILDER_SRC = join(import.meta.dirname, "..", "src")

/** Modules that may hold a raw base, with the reason they are not procedures. */
const RAW_BASE_ALLOWLIST = new Set([
  // A middleware, not a procedure: it is chained onto the connect routes,
  // which are themselves built on `authorizedAPI`.
  "features/channel-connect/api/audit-context.ts",
])

const AUTHENTICATED_BASE =
  /\b(authorizedAPI|workspaceTokenAuthAPIForScope|channelApiTokenAPI)\b/

const PROCEDURE_HANDLER = /\.handler\(/

const EXPORTED_CONST = /^export const (\w+)/gm

const RAW_BASE_IMPORT =
  /import\s*\{[^}]*\b(?:base|os|implement)\b[^}]*\}\s*from\s*["'](?:@orpc\/server|@\/middlewares\/context)["']/

/** Every `.ts` under a `features/<name>/api/` directory, recursively. */
const apiModules = (): string[] => {
  const featuresDir = join(BUILDER_SRC, "features")
  const collect = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(entry.parentPath, entry.name))

  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((feature) => {
      const apiDir = join(featuresDir, feature.name, "api")
      try {
        return collect(apiDir)
      } catch {
        return []
      }
    })
}

describe("/rpc router auth surface", () => {
  test("@/orpc exports only authenticated procedure bases", () => {
    const source = readFileSync(join(BUILDER_SRC, "orpc.ts"), "utf8")
    const exported = [...source.matchAll(EXPORTED_CONST)].map(
      (match) => match[1],
    )

    // Adding an export here means adding a way to mount a procedure. If it is
    // not one of these three, it must carry its own auth middleware — and this
    // test is where that decision gets recorded.
    expect(exported.sort()).toEqual([
      "authorizedAPI",
      "channelApiTokenAPI",
      "workspaceTokenAuthAPIForScope",
    ])
  })

  test("no feature api module imports a raw oRPC base", () => {
    const offenders: string[] = []

    for (const file of apiModules()) {
      const relativePath = relative(BUILDER_SRC, file)
      if (RAW_BASE_ALLOWLIST.has(relativePath)) {
        continue
      }
      if (RAW_BASE_IMPORT.test(readFileSync(file, "utf8"))) {
        offenders.push(relativePath)
      }
    }

    expect(offenders).toEqual([])
  })

  test("every feature api module builds on one of the authenticated bases", () => {
    const files = apiModules()
    expect(files.length).toBeGreaterThan(50)

    // Helper modules that define no procedure at all are not a surface.
    const procedureModules = files
      .map((file) => ({
        path: relative(BUILDER_SRC, file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ source }) => PROCEDURE_HANDLER.test(source))
    // Guards the filter itself: an empty set would make the check vacuous.
    expect(procedureModules.length).toBeGreaterThan(50)

    const unauthenticated = procedureModules
      .filter(({ source }) => !AUTHENTICATED_BASE.test(source))
      .map(({ path }) => path)

    expect(unauthenticated).toEqual([])
  })
})
