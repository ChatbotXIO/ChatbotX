import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// `package.json#sideEffects` lets Turbopack (builder) and rolldown (worker
// tsdown bundle) skip business modules whose exports a route never uses. Any
// module that does real work at import time must be listed there, or a bundler
// may drop it and the work silently never happens.
const PACKAGE_ROOT = join(import.meta.dirname, "..")
const SRC = join(PACKAGE_ROOT, "src")

// Top-level `globalForX.y = ...` / `globalThis.y = ...` assignments that run at
// module evaluation (e.g. the audit recorder hook in `audit/service.ts`).
const TOP_LEVEL_GLOBAL_ASSIGNMENT =
  /^(globalThis|globalFor\w+)(\.\w+)+\s*=[^=]/m
const TS_FILE = /\.ts$/
const TEST_OR_DECLARATION_FILE = /\.(test|d)\.ts$/

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" ? [] : listSourceFiles(path)
    }
    return TS_FILE.test(entry) && !TEST_OR_DECLARATION_FILE.test(entry)
      ? [path]
      : []
  })

const readSideEffects = (): string[] => {
  const pkg = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
  ) as { sideEffects?: unknown }
  expect(Array.isArray(pkg.sideEffects)).toBe(true)
  return pkg.sideEffects as string[]
}

describe("business package.json sideEffects", () => {
  it("lists every module that assigns a global at import time", () => {
    const sideEffects = readSideEffects()
    const offenders = listSourceFiles(SRC)
      .filter((file) =>
        TOP_LEVEL_GLOBAL_ASSIGNMENT.test(readFileSync(file, "utf8")),
      )
      .map((file) => `./${relative(PACKAGE_ROOT, file)}`)

    expect(offenders).toContain("./src/audit/service.ts")
    expect(sideEffects).toEqual(expect.arrayContaining(offenders))
  })

  it("keeps the audit barrel side-effectful so any `@chatbotx.io/business/audit` import installs the recorder", () => {
    expect(readSideEffects()).toEqual(
      expect.arrayContaining([
        "./src/audit/index.ts",
        "./src/audit/service.ts",
      ]),
    )
  })

  it("lists only files that exist", () => {
    for (const path of readSideEffects()) {
      expect(statSync(join(PACKAGE_ROOT, path)).isFile()).toBe(true)
    }
  })
})
