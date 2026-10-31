// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * `@chatbotx.io/business/*\/execute` subpaths are the Node-only execution half
 * of a request/execute split (AGENTS.md invariant 25): only the worker may
 * import them. The builder's router graph is compiled into the Edge
 * instrumentation bundle, so a builder file importing one drags worker-only
 * code into it. A request/transaction service the builder needs (for example
 * restoring a sync backup) lives in its own subpath instead.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const BUILDER_SRC = join(HERE, "..", "src")
const WORKER_ONLY_SUBPATH = /["']@chatbotx\.io\/business\/[\w-]+\/execute["']/

const TS_SOURCE = /\.tsx?$/

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(path)
    }
    return TS_SOURCE.test(entry.name) ? [path] : []
  })

describe("worker-only business subpaths", () => {
  test("no builder file imports an `execute` subpath", () => {
    const offenders = sourceFiles(BUILDER_SRC)
      .filter((file) => WORKER_ONLY_SUBPATH.test(readFileSync(file, "utf8")))
      .map((file) => relative(BUILDER_SRC, file))

    expect(offenders).toEqual([])
  })

  test("the builder reaches sync restore through its own subpath", () => {
    const files = sourceFiles(BUILDER_SRC).filter((file) =>
      readFileSync(file, "utf8").includes(
        "@chatbotx.io/business/template-sync/restore",
      ),
    )

    expect(files.length).toBeGreaterThan(0)
  })
})
