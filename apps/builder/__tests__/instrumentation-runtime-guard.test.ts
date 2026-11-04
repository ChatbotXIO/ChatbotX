// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Next.js compiles `src/instrumentation.ts` for the Edge runtime as well as
 * Node.js. Any import outside the `NEXT_RUNTIME === "nodejs"` guard is traced
 * into the Edge bundle — for the oRPC server that is the whole router graph,
 * which doubled the cold `next dev` compile and forced every module the router
 * reaches to be Edge-safe. The builder has no Edge routes, so server code loads
 * only inside the guard (AGENTS.md invariant 25).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const BUILDER_SRC = join(HERE, "../src")
const INSTRUMENTATION = join(BUILDER_SRC, "instrumentation.ts")
const NODE_GUARD = 'if (process.env.NEXT_RUNTIME === "nodejs") {'
const ALLOWED_TOP_LEVEL_IMPORTS = new Set(["next/constants"])
const STATIC_IMPORT = /^import[^"']*["']([^"']+)["']/gm
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']/g
const EDGE_RUNTIME_EXPORT = /export\s+const\s+runtime\s*=\s*["']edge["']/
const SOURCE_FILE = /\.(ts|tsx)$/

/** Returns the source with every Node-guarded block (braces included) removed. */
const stripNodeGuardedBlocks = (source: string): string => {
  let result = source
  let start = result.indexOf(NODE_GUARD)
  while (start !== -1) {
    let depth = 0
    let end = start + NODE_GUARD.length - 1
    for (; end < result.length; end++) {
      if (result[end] === "{") {
        depth++
      } else if (result[end] === "}") {
        depth--
        if (depth === 0) {
          break
        }
      }
    }
    result = result.slice(0, start) + result.slice(end + 1)
    start = result.indexOf(NODE_GUARD)
  }
  return result
}

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listSourceFiles(path)
    }
    return SOURCE_FILE.test(entry.name) ? [path] : []
  })

describe("builder instrumentation runtime guard", () => {
  const source = readFileSync(INSTRUMENTATION, "utf8")
  const unguarded = stripNodeGuardedBlocks(source)

  test("imports nothing outside the Node.js guard except next/constants", () => {
    const staticImports = [...unguarded.matchAll(STATIC_IMPORT)].map(
      (m) => m[1],
    )
    const dynamicImports = [...unguarded.matchAll(DYNAMIC_IMPORT)].map(
      (m) => m[1],
    )

    expect(
      staticImports.filter((s) => !ALLOWED_TOP_LEVEL_IMPORTS.has(s)),
    ).toEqual([])
    expect(dynamicImports).toEqual([])
  })

  test("still loads the oRPC SSR client inside the guard", () => {
    // Guards the check itself: if the guard string drifted, the first test
    // would pass vacuously because nothing would be stripped.
    expect(source).toContain(NODE_GUARD)
    expect(source).toContain('await import("./lib/orpc/orpc.server")')
    expect(unguarded).not.toContain("orpc.server")
  })

  test("no route or page opts into the Edge runtime", () => {
    const edgeFiles = listSourceFiles(BUILDER_SRC).filter((file) =>
      EDGE_RUNTIME_EXPORT.test(readFileSync(file, "utf8")),
    )

    expect(edgeFiles).toEqual([])
  })
})
