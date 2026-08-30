// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"

const SRC_ROOT = join(import.meta.dirname, "..", "src")
const PUBLIC_ROUTER_FILE = join(SRC_ROOT, "routers", "public.ts")
const TS_EXTENSION_PATTERN = /\.ts$/

// A feature "publishes" a public, workspace-token-authed surface via this
// conventional filename.
const WORKSPACE_TOKEN_API_FILENAMES = new Set(["workspace-token.ts"])

function collectWorkspaceTokenApiFiles(dir: string, results: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") {
      continue
    }

    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      collectWorkspaceTokenApiFiles(fullPath, results)
    } else if (WORKSPACE_TOKEN_API_FILENAMES.has(entry)) {
      results.push(fullPath)
    }
  }

  return results
}

describe("public router boundary", () => {
  // `/api/[[...rest]]` now serves ONLY `publicRouter` — a workspace-token
  // API file that forgets to register itself in routers/public.ts is
  // reachable from nowhere (invisible to MCP/CLI/Postman) instead of merely
  // leaking into the full-router spec, so the failure mode inverts from
  // "over-exposed" to "silently unreachable". This test catches either a new
  // feature's workspace-token.ts never being wired in, or public.ts's import
  // being deleted/renamed without removing the source file.
  test("every features/**/api/workspace-token.ts file is imported in routers/public.ts", () => {
    const workspaceTokenApiFiles = [
      ...collectWorkspaceTokenApiFiles(join(SRC_ROOT, "features")),
      ...collectWorkspaceTokenApiFiles(join(SRC_ROOT, "enterprise")),
    ]

    expect(workspaceTokenApiFiles.length).toBeGreaterThan(0)

    const publicRouterSource = readFileSync(PUBLIC_ROUTER_FILE, "utf8")

    const missing = workspaceTokenApiFiles.filter((filePath) => {
      // routers/public.ts imports by module specifier without extension,
      // e.g. "@/features/tags/api/workspace-token" for
      // src/features/tags/api/workspace-token.ts.
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
