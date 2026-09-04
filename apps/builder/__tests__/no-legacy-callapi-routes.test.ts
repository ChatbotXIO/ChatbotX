// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const APP_ROOT = join(import.meta.dirname, "..")
const SRC_ROOT = join(APP_ROOT, "src")
const TS_LIKE_EXTENSION_PATTERN = /\.(ts|tsx)$/

// `callAPI` (apps/builder/src/lib/swr.ts) was the legacy fetch-based SWR
// helper used before flow-step editors and stores were migrated to
// `useClientQuery` + the typed oRPC `client`. It was removed once every
// consumer was ported (see git history around the oRPC error-mapping
// refactor) — this guards against a new consumer quietly reintroducing it
// (or the export itself) instead of using the oRPC client.
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

describe("legacy callAPI removal", () => {
  test("no source file references callAPI", () => {
    const offenders = collectSourceFiles(SRC_ROOT).filter((filePath) =>
      readFileSync(filePath, "utf8").includes("callAPI"),
    )

    expect(offenders).toEqual([])
  })

  test("lib/swr.ts only exports useClientQuery", () => {
    const swrSource = readFileSync(join(SRC_ROOT, "lib", "swr.ts"), "utf8")

    expect(swrSource).toContain("useClientQuery")
    expect(swrSource).not.toContain("export const callAPI")
    expect(swrSource).not.toContain("export function callAPI")
  })
})

describe("dev-only OpenAPI mirror routes stay removed", () => {
  // /api-internal (full-router, dev-only Scalar mirror) and /api/scalar-ui
  // (a hand-rolled docs page superseded by OpenAPIReferencePlugin's built-in
  // Scalar UI at `${prefix}/`) were both deleted as redundant surface area
  // once the public `/api` OpenAPI handler grew its own docs page. Guard
  // against either reappearing.
  test.each([
    ["api-internal", join(SRC_ROOT, "app", "api-internal")],
    ["api/scalar-ui", join(SRC_ROOT, "app", "api", "scalar-ui")],
  ])("%s route directory does not exist", (_label, routeDir) => {
    expect(existsSync(routeDir)).toBe(false)
  })

  test("proxy.ts public routes no longer mention api-internal", () => {
    const proxySource = readFileSync(join(SRC_ROOT, "proxy.ts"), "utf8")

    expect(proxySource).not.toContain("api-internal")
  })
})
