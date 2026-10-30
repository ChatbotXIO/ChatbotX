import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const dockerIgnore = readFileSync(
  new URL("../../../.dockerignore", import.meta.url),
  "utf8",
)

const dockerIgnoreLines = dockerIgnore.split("\n").map((line) => line.trim())

describe("MCP Docker build context", () => {
  test("keeps runtime guide markdown after the markdown exclusion", () => {
    const markdownExclusionIndex = dockerIgnoreLines.indexOf("**/*.md")
    const guideExceptionIndex = dockerIgnoreLines.indexOf(
      "!apps/mcp-server/src/guides/*.md",
    )

    expect(markdownExclusionIndex).toBeGreaterThanOrEqual(0)
    expect(guideExceptionIndex).toBeGreaterThan(markdownExclusionIndex)
  })
})
