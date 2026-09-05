// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"

const SRC_ROOT = join(import.meta.dirname, "..", "src")
const PUBLIC_ROUTER_FILE = join(SRC_ROOT, "routers", "public.ts")
const TS_EXTENSION_PATTERN = /\.ts$/

// A feature "publishes" a public surface — authed by either a workspace
// token or a channel API token — via this conventional filename.
const PUBLIC_API_FILENAME = "public.ts"

function collectPublicApiFiles(dir: string, results: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") {
      continue
    }

    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      collectPublicApiFiles(fullPath, results)
    } else if (entry === PUBLIC_API_FILENAME) {
      results.push(fullPath)
    }
  }

  return results
}

describe("public router boundary", () => {
  // `/api/[[...rest]]` now serves ONLY `publicRouter` — a public API file
  // that forgets to register itself in routers/public.ts is reachable from
  // nowhere (invisible to MCP/CLI/Postman) instead of merely leaking into
  // the full-router spec, so the failure mode inverts from "over-exposed" to
  // "silently unreachable". This test catches either a new feature's
  // public.ts never being wired in, or public.ts's import being
  // deleted/renamed without removing the source file.
  test("every features/**/api/public.ts file is imported in routers/public.ts", () => {
    const publicApiFiles = [
      ...collectPublicApiFiles(join(SRC_ROOT, "features")),
      ...collectPublicApiFiles(join(SRC_ROOT, "enterprise")),
    ]

    expect(publicApiFiles.length).toBeGreaterThan(0)

    const publicRouterSource = readFileSync(PUBLIC_ROUTER_FILE, "utf8")

    const missing = publicApiFiles.filter((filePath) => {
      // routers/public.ts imports by module specifier without extension,
      // e.g. "@/features/tags/api/public" for
      // src/features/tags/api/public.ts.
      const relativePath = relative(SRC_ROOT, filePath)
        .replace(TS_EXTENSION_PATTERN, "")
        .split("\\")
        .join("/")
      const specifier = `@/${relativePath}`

      return !publicRouterSource.includes(specifier)
    })

    expect(missing).toEqual([])
  })
})
