// @vitest-environment node
import { readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import postcss from "postcss"
import { describe, expect, test } from "vitest"

/**
 * Tailwind source guard. Workspace UI packages are reached through their pnpm
 * symlink in `node_modules`, and an `@source` on a package ROOT also scans that
 * package's own `node_modules` — every linked workspace package and all their
 * third-party dependencies. One root-level source pushed the stylesheet compile
 * to ~360k scanned files and ~6 GB of memory in `next dev` / `next build`.
 * Every workspace package source must therefore point at its `src` directory.
 */
const GLOBALS_CSS = join(import.meta.dirname, "../src/app/globals.css")
const REPO_ROOT = join(import.meta.dirname, "../../..")
/**
 * A workspace package, reached either directly (`packages/<pkg>`,
 * `integrations/<pkg>`) or through its pnpm link
 * (`node_modules/@chatbotx.io/<pkg>`). Captures the path inside the package.
 */
const WORKSPACE_PACKAGE_PATH =
  /^(?:packages|integrations)\/[^/]+(\/.*)?$|(?:^|\/)node_modules\/@chatbotx\.io\/[^/]+(\/.*)?$/
const REQUIRED_SOURCES = [
  "../../node_modules/@chatbotx.io/ui/src",
  "../../node_modules/@chatbotx.io/analytics-nextjs/src",
  "../../node_modules/@chatbotx.io/minigame-ui/src",
]

/**
 * Whether a source registers a workspace package outside its `src` (the
 * package root, or any other top-level folder such as `node_modules`).
 * `src` itself or any folder inside it is fine.
 */
function isOutsidePackageSrc(source: string): boolean {
  // Resolved like Tailwind does (relative to the stylesheet), so `..`
  // segments cannot sneak back to the package root.
  const fromRepoRoot = relative(
    REPO_ROOT,
    resolve(dirname(GLOBALS_CSS), source),
  )
    .split(sep)
    .join("/")
  const match = WORKSPACE_PACKAGE_PATH.exec(fromRepoRoot)
  if (!match) {
    return false
  }
  const insidePackage = match[1] ?? match[2] ?? ""
  return !(insidePackage === "/src" || insidePackage.startsWith("/src/"))
}

/** The real `@source` directives (comments never count), unquoted. */
function sourceDirectives(): string[] {
  const root = postcss.parse(readFileSync(GLOBALS_CSS, "utf8"))
  const sources: string[] = []
  root.walkAtRules("source", (rule) => {
    sources.push(rule.params.trim().replace(/^["']|["']$/g, ""))
  })
  return sources
}

describe("globals.css Tailwind sources", () => {
  test("scans the src of every workspace UI package the builder renders", () => {
    expect(sourceDirectives()).toEqual(expect.arrayContaining(REQUIRED_SOURCES))
  })

  test("never points a workspace package source at the package root", () => {
    expect(sourceDirectives().filter(isOutsidePackageSrc)).toEqual([])
  })

  test.each([
    ["../../node_modules/@chatbotx.io/ui", true],
    ["../../node_modules/@chatbotx.io/ui/", true],
    ["../../node_modules/@chatbotx.io/ui/node_modules", true],
    ["../../node_modules/@chatbotx.io/ui/src/..", true],
    ["../../../../packages/ui", true],
    ["../../../../packages/ui/node_modules", true],
    ["../../../../integrations/messenger", true],
    ["../../../../packages/ui/src", false],
    ["../../../../packages/ui/src/components", false],
    ["../../node_modules/@chatbotx.io/ui/src", false],
    ["../../node_modules/@chatbotx.io/ui/src/components", false],
    ["../../node_modules/some-lib", false],
    ["../components", false],
  ])("%s is outside the package src: %s", (source, expected) => {
    expect(isOutsidePackageSrc(source)).toBe(expected)
  })
})
