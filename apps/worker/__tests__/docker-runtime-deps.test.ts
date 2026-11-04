import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

// `@ai-sdk/provider-utils` loads `undici` through `createRequire(<bundle>)`,
// which tsdown cannot inline, so the release image installs it next to `dist`.
// The pinned version there must match the one the SDK resolves in the lockfile.
const dockerfile = readFileSync(
  new URL("../docker/Dockerfile", import.meta.url),
  "utf8",
)
const lockfile = readFileSync(
  new URL("../../../pnpm-lock.yaml", import.meta.url),
  "utf8",
)

const PROVIDER_UTILS_ENTRY = /^ {2}'@ai-sdk\/provider-utils@[^']+':$/
const UNDICI_DEPENDENCY = /^ {6}undici: (\d+\.\d+\.\d+)/
const DOCKERFILE_UNDICI = /undici@(\d+\.\d+\.\d+)/

function providerUtilsUndiciVersions(lock: string): string[] {
  const versions: string[] = []
  const lines = lock.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (!PROVIDER_UTILS_ENTRY.test(lines[i] ?? "")) {
      continue
    }
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? ""
      if (line.trim() === "") {
        break
      }
      const match: RegExpMatchArray | null = line.match(UNDICI_DEPENDENCY)
      if (match?.[1]) {
        versions.push(match[1])
      }
    }
  }
  return versions
}

describe("worker release image runtime deps", () => {
  test("installs the undici version @ai-sdk/provider-utils resolves", () => {
    const lockVersions = providerUtilsUndiciVersions(lockfile)
    expect(
      lockVersions.length,
      "no @ai-sdk/provider-utils snapshot in pnpm-lock.yaml depends on undici",
    ).toBeGreaterThan(0)

    const distinct = [...new Set(lockVersions)]
    expect(
      distinct,
      "@ai-sdk/provider-utils snapshots resolve different undici versions",
    ).toHaveLength(1)
    const expected = distinct[0]

    const dockerVersion = dockerfile.match(DOCKERFILE_UNDICI)?.[1]
    expect(
      dockerVersion,
      `update \`undici@${expected}\` in apps/worker/docker/Dockerfile`,
    ).toBe(expected)
  })
})
