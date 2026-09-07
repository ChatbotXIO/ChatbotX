// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test, vi } from "vitest"

const LEAF_PATH = resolve(
  import.meta.dirname,
  "../src/inbox/connect-outcome-types.ts",
)
const IMPORT_STATEMENT_REGEX = /^\s*import\s/m

describe("connect-outcome-types.ts stays a dependency-free leaf", () => {
  test("the source file has zero import statements", () => {
    const source = readFileSync(LEAF_PATH, "utf8")
    expect(source).not.toMatch(IMPORT_STATEMENT_REGEX)
  })

  test("it can be imported with @chatbotx.io/sdk and drizzle-orm mocked to throw", async () => {
    vi.resetModules()
    vi.doMock("@chatbotx.io/sdk", () => {
      throw new Error(
        "connect-outcome-types.ts must not import @chatbotx.io/sdk",
      )
    })
    vi.doMock("drizzle-orm", () => {
      throw new Error("connect-outcome-types.ts must not import drizzle-orm")
    })

    const mod = await import("../src/inbox/connect-outcome-types")

    expect(mod.CONNECT_ITEM_STATUSES.connected).toBe("connected")
    expect(mod.CONNECT_SESSION_ERROR_CODES.sessionExpired).toBe(
      "sessionExpired",
    )

    vi.doUnmock("@chatbotx.io/sdk")
    vi.doUnmock("drizzle-orm")
    vi.resetModules()
  })
})
