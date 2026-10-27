// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * `src/instrumentation.ts` imports the oRPC server, and Next.js compiles it for
 * the Edge runtime too: it traces the whole router graph — lazy `import()`
 * routes, `@/` modules, every `@chatbotx.io/*` package and subpath they reach —
 * into the Edge instrumentation bundle. A runtime `node:` import anywhere in that
 * graph is "A Node.js module is loaded … not supported in the Edge Runtime".
 *
 * Turbopack additionally rejects Node APIs reached through `process` (anything
 * but `process.env`, e.g. `process.getBuiltinModule`).
 *
 * Fix it by splitting the module, never by gating `instrumentation.ts`
 * (AGENTS.md invariant 25): keep the Node-only half behind its own package
 * subpath, imported only by actions, the public API or workers.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../..")
const BUILDER_SRC = join(REPO_ROOT, "apps/builder/src")
const ENTRY = join(BUILDER_SRC, "lib/orpc/orpc.server.ts")

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
])

/**
 * Next.js polyfills only `AsyncLocalStorage` on Edge
 * (node_modules/next/dist/docs/01-app/03-api-reference/07-edge.md).
 */
const EDGE_PROVIDED_BUILTINS = new Set(["async_hooks"])
const NODE_SCHEME = /^node:/
const TS_SOURCE = /\.tsx?$/

/** `import type { … }`, `export type { … }`, `{ type a, type b }` — erased at build. */
const TYPE_ONLY_CLAUSE = /^(?:type\s[\s\S]*|\{\s*(?:type\s+[^,}]+,?\s*)+\})$/
/** No `"`/`'` in the clause, so a preceding bare `import "x"` is never swallowed. */
const FROM_PATTERN =
  /\b(?:import|export)\s+([^;"']*?)\s*\bfrom\s+["']([^"']+)["']/g
/** Bare `import "x"` and lazy `import("x")` — the bundler follows both. */
const BARE_OR_DYNAMIC_PATTERN = /\bimport\s*\(?\s*["']([^"']+)["']/g
/**
 * Turbopack also flags Node APIs reached through `process` ("A Node.js API is
 * used (process.getBuiltinModule …)"). Only `process.env` is available on Edge.
 */
const PROCESS_API_PATTERN = /\bprocess\s*\??\.\s*(?!env\b)([A-Za-z_$][\w$]*)/g
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT = /(^|\s)\/\/.*$/gm

type PackageEntry = { root: string; exports: Record<string, unknown> }

const readIfFile = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return null
  }
}

const workspacePackages = (): Map<string, PackageEntry> => {
  const packages = new Map<string, PackageEntry>()
  for (const group of ["packages", "integrations"]) {
    for (const name of readdirSync(join(REPO_ROOT, group))) {
      const root = join(REPO_ROOT, group, name)
      const manifestPath = join(root, "package.json")
      if (!existsSync(manifestPath)) {
        continue
      }
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
      if (manifest.name?.startsWith("@chatbotx.io/") && manifest.exports) {
        const exports =
          typeof manifest.exports === "string"
            ? { ".": manifest.exports }
            : manifest.exports
        packages.set(manifest.name, { root, exports })
      }
    }
  }
  return packages
}

/** TS path resolution: `./x` may be x.ts, x.tsx, or x/index.ts(x). */
const resolveFile = (base: string): string | null => {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (TS_SOURCE.test(candidate) && readIfFile(candidate) !== null) {
      return candidate
    }
  }
  return null
}

const exportTarget = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value
  }
  if (value && typeof value === "object") {
    const conditions = value as Record<string, unknown>
    const target = conditions.import ?? conditions.default
    return typeof target === "string" ? target : null
  }
  return null
}

const collectSpecifiers = (source: string): string[] => {
  const specifiers = new Set<string>()
  for (const match of source.matchAll(FROM_PATTERN)) {
    if (match[2] && !TYPE_ONLY_CLAUSE.test((match[1] ?? "").trim())) {
      specifiers.add(match[2])
    }
  }
  for (const match of source.matchAll(BARE_OR_DYNAMIC_PATTERN)) {
    if (match[1]) {
      specifiers.add(match[1])
    }
  }
  return [...specifiers]
}

/** Comments mention `process.exit` and friends without calling them. */
const stripComments = (source: string): string =>
  source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "$1")

const collectProcessApis = (source: string): string[] => [
  ...new Set(
    [...stripComments(source).matchAll(PROCESS_API_PATTERN)].map(
      (match) => `process.${match[1]}`,
    ),
  ),
]

type Violation = { builtin: string; chain: string[] }

const auditEdgeGraph = (entry: string): Violation[] => {
  const packages = workspacePackages()
  // Longest name first, so `@chatbotx.io/ai-x` never matches `@chatbotx.io/ai`.
  const packageNames = [...packages.keys()].sort((a, b) => b.length - a.length)

  const resolveSpecifier = (specifier: string, importer: string) => {
    if (specifier.startsWith(".")) {
      return resolveFile(resolve(dirname(importer), specifier))
    }
    if (specifier.startsWith("@/")) {
      return resolveFile(join(BUILDER_SRC, specifier.slice(2)))
    }
    const name = packageNames.find(
      (candidate) =>
        specifier === candidate || specifier.startsWith(`${candidate}/`),
    )
    const entryPackage = name ? packages.get(name) : undefined
    if (!(name && entryPackage)) {
      return null
    }
    const target = exportTarget(
      entryPackage.exports[`.${specifier.slice(name.length)}`],
    )
    return target ? join(entryPackage.root, target) : null
  }

  const parents = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  const violations: Violation[] = []

  const chainTo = (path: string): string[] => {
    const chain: string[] = []
    let cursor: string | null | undefined = path
    while (cursor) {
      chain.unshift(relative(REPO_ROOT, cursor))
      cursor = parents.get(cursor)
    }
    return chain
  }

  while (queue.length > 0) {
    const current = queue.shift() as string
    const source = readIfFile(current)
    if (source === null) {
      continue
    }
    for (const api of collectProcessApis(source)) {
      violations.push({ builtin: api, chain: chainTo(current) })
    }
    for (const specifier of collectSpecifiers(source)) {
      const bare = specifier.replace(NODE_SCHEME, "")
      if (specifier.startsWith("node:") || NODE_BUILTINS.has(bare)) {
        if (!EDGE_PROVIDED_BUILTINS.has(bare)) {
          violations.push({ builtin: specifier, chain: chainTo(current) })
        }
        continue
      }
      const resolved = resolveSpecifier(specifier, current)
      if (resolved && !parents.has(resolved)) {
        parents.set(resolved, current)
        queue.push(resolved)
      }
    }
  }

  return violations
}

describe("builder Edge instrumentation graph", () => {
  test("reaches no Node built-in or process API the Edge runtime lacks", () => {
    const report = auditEdgeGraph(ENTRY)
      .map((v) => `${v.builtin} in\n    ${v.chain.reverse().join("\n    ← ")}`)
      .join("\n\n")

    expect(report).toBe("")
  })

  test("the audit follows lazy router imports into workspace packages", () => {
    // Guards the walker itself: if `import()` or subpath resolution broke, the
    // first test would pass vacuously.
    const source = readFileSync(join(BUILDER_SRC, "routers/index.ts"), "utf8")
    expect(
      collectSpecifiers(source).some((s) => s.startsWith("@/features/")),
    ).toBe(true)
  })
})
