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
      // `schema/public.ts` shares the filename but is never a router — only
      // `api/public.ts` publishes a surface.
    } else if (entry === PUBLIC_API_FILENAME && dir.endsWith(`${"api"}`)) {
      results.push(fullPath)
    }
  }

  return results
}

const specifierFor = (filePath: string): string => {
  const relativePath = relative(SRC_ROOT, filePath)
    .replace(TS_EXTENSION_PATTERN, "")
    .split("\\")
    .join("/")
  return `@/${relativePath}`
}

describe("public router boundary", () => {
  // `/api/[[...rest]]` now serves ONLY `publicRouter` — a public API file
  // that forgets to register itself in routers/public.ts is reachable from
  // nowhere (invisible to MCP/CLI/Postman) instead of merely leaking into
  // the full-router spec, so the failure mode inverts from "over-exposed" to
  // "silently unreachable". This test catches either a new feature's
  // public.ts never being wired in, or public.ts's import being
  // deleted/renamed without removing the source file.
  test("every features/**/api/public.ts file is registered — directly in routers/public.ts, or composed into a file that is", () => {
    const publicApiFiles = [
      ...collectPublicApiFiles(join(SRC_ROOT, "features")),
      ...collectPublicApiFiles(join(SRC_ROOT, "enterprise")),
    ]

    expect(publicApiFiles.length).toBeGreaterThan(0)

    const publicRouterSource = readFileSync(PUBLIC_ROUTER_FILE, "utf8")

    // A file counts as registered if routers/public.ts imports it directly,
    // or if some OTHER already-registered public.ts imports it (one level of
    // sub-router composition — e.g. contact-notes/api/public.ts is merged
    // into contacts/api/public.ts, not registered separately).
    const sourceByFile = new Map(
      publicApiFiles.map((filePath) => [
        filePath,
        readFileSync(filePath, "utf8"),
      ]),
    )

    const isRegistered = (
      filePath: string,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(filePath)) {
        return false
      }
      seen.add(filePath)

      const specifier = specifierFor(filePath)
      if (publicRouterSource.includes(specifier)) {
        return true
      }
      return publicApiFiles.some((otherFile) => {
        if (otherFile === filePath) {
          return false
        }
        const otherSource = sourceByFile.get(otherFile)
        return (
          Boolean(otherSource?.includes(specifier)) &&
          isRegistered(otherFile, seen)
        )
      })
    }

    const missing = publicApiFiles.filter((filePath) => !isRegistered(filePath))

    expect(missing).toEqual([])
  })
})
