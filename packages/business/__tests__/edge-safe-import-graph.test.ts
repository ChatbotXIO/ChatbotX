import { readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * The builder's `instrumentation.ts` is compiled for BOTH the node and the edge
 * runtime, and Next.js traces its import graph into each bundle. Anything the
 * `@chatbotx.io/business` barrel reaches statically therefore has to survive the
 * Edge Runtime, which has no Node built-ins — a single `import "crypto"` deep in
 * the graph turns into a hard "Ecmascript file had an error" at build time.
 *
 * Scope is deliberate: this walks relative imports inside `packages/business`
 * plus `@chatbotx.io/sequence-scheduler` (resolved through its `exports` map),
 * because that is the boundary where the barrel drags queue/scheduler internals
 * in. It is not a whole-monorepo Edge audit.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../..")
const BUSINESS_SRC = join(REPO_ROOT, "packages/business/src")
const SCHEDULER_ROOT = join(REPO_ROOT, "packages/sequence-scheduler")

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "fs",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "readline",
  "stream",
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

const SCHEDULER_BARREL_IMPORT = /from "@chatbotx\.io\/sequence-scheduler"/

const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)

/** Static `from "x"` / `import "x"` specifiers. Dynamic import() is banned repo-wide. */
const collectSpecifiers = (source: string): string[] => {
  const specifiers = new Set<string>()
  const fromPattern = /\bfrom\s+["']([^"']+)["']/g
  const bareImportPattern = /\bimport\s+["']([^"']+)["']/g

  for (const pattern of [fromPattern, bareImportPattern]) {
    let match = pattern.exec(source)
    while (match) {
      if (match[1]) {
        specifiers.add(match[1])
      }
      match = pattern.exec(source)
    }
  }

  return [...specifiers]
}

const readIfFile = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return null
  }
}

/** TS path resolution: `./x` may be x.ts, x.tsx, or x/index.ts. */
const resolveFile = (base: string): string | null => {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    const isTsSource = candidate.endsWith(".ts") || candidate.endsWith(".tsx")

    if (isTsSource && readIfFile(candidate) !== null) {
      return candidate
    }
  }

  return null
}

const schedulerExports = (): Record<string, string> =>
  JSON.parse(readFileSync(join(SCHEDULER_ROOT, "package.json"), "utf8")).exports

/**
 * Resolves only what this audit covers. Returns null for every other package so
 * the walk stays inside the business ↔ sequence-scheduler boundary.
 */
const resolveSpecifier = (
  specifier: string,
  importerPath: string,
): string | null => {
  if (specifier.startsWith(".")) {
    return resolveFile(resolve(dirname(importerPath), specifier))
  }

  if (specifier === "@chatbotx.io/sequence-scheduler") {
    const target = schedulerExports()["."]
    return target ? join(SCHEDULER_ROOT, target) : null
  }

  if (specifier.startsWith("@chatbotx.io/sequence-scheduler/")) {
    const subpath = `.${specifier.slice("@chatbotx.io/sequence-scheduler".length)}`
    const target = schedulerExports()[subpath]
    return target ? join(SCHEDULER_ROOT, target) : null
  }

  return null
}

type Violation = { builtin: string; chain: string[] }

const auditFrom = (entry: string): Violation[] => {
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

    for (const specifier of collectSpecifiers(source)) {
      if (isNodeBuiltin(specifier)) {
        violations.push({ builtin: specifier, chain: chainTo(current) })
        continue
      }

      const resolved = resolveSpecifier(specifier, current)
      if (!resolved || parents.has(resolved)) {
        continue
      }

      parents.set(resolved, current)
      queue.push(resolved)
    }
  }

  return violations
}

describe("@chatbotx.io/business barrel stays Edge-Runtime safe", () => {
  test("reaches no Node built-in through the sequence-scheduler boundary", () => {
    const violations = auditFrom(join(BUSINESS_SRC, "index.ts"))

    const report = violations
      .map((v) => `${v.builtin} via\n    ${v.chain.join("\n    → ")}`)
      .join("\n\n")

    expect(report).toBe("")
  })

  test("freezeWorkspaceRuntime keeps cancelling dispatches through a crypto-free module", () => {
    // Guards the fix's intent, not just its absence of symptoms: the freeze path
    // must still reach the real cancel + Redis-removal helpers.
    const service = readFileSync(
      join(BUSINESS_SRC, "workspace-lifecycle/service.ts"),
      "utf8",
    )

    expect(service).toContain("cancelPendingDispatchesForWorkspace")
    expect(service).toContain("removeDispatchesFromSchedule")
    expect(service).not.toMatch(SCHEDULER_BARREL_IMPORT)
  })
})
