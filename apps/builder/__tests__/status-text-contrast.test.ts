// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, test } from "vitest"

const REPO_ROOT = resolve(import.meta.dirname, "../../..")
const SOURCE_ROOTS = [
  join(REPO_ROOT, "apps/builder/src"),
  join(REPO_ROOT, "packages/ui/src"),
]
const SOURCE_FILE = /\.tsx?$/
const CLASS_TOKEN = /[^\s"'`]+/g
const LOW_CONTRAST_STATE_COLOR = /text-(?:amber|emerald)-600\b/
const AMBER_OPACITY = /text-amber-\d+\/\d+\b/

const collectOffenders = (): string[] => {
  const offenders: string[] = []

  for (const sourceRoot of SOURCE_ROOTS) {
    const sourceFiles = readdirSync(sourceRoot, {
      encoding: "utf8",
      recursive: true,
    }).filter((file) => SOURCE_FILE.test(file))

    for (const file of sourceFiles) {
      const filePath = join(sourceRoot, file)
      const relativePath = relative(REPO_ROOT, filePath)

      for (const [index, line] of readFileSync(filePath, "utf8")
        .split("\n")
        .entries()) {
        for (const match of line.matchAll(CLASS_TOKEN)) {
          const token = match[0]
          const isDarkModeToken = token.split(":").includes("dark")
          const isLowContrastText =
            LOW_CONTRAST_STATE_COLOR.test(token) || AMBER_OPACITY.test(token)

          if (!isDarkModeToken && isLowContrastText) {
            offenders.push(`${relativePath}:${index + 1}: ${token}`)
          }
        }
      }
    }
  }

  return offenders
}

describe("status text contrast", () => {
  test("does not use low-contrast amber or emerald text colors in light mode", () => {
    expect(collectOffenders()).toEqual([])
  })
})
