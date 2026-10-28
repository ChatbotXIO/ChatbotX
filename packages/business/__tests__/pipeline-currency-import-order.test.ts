// @vitest-environment node

import { describe, expect, test } from "vitest"

/** Loading the currency resolver before the workspace service must not throw. */
describe("currency import order", () => {
  test("loading the currency resolver first resolves the workspace cycle", async () => {
    const { resolveWorkspaceCurrency } = await import(
      "../src/pipeline/currency"
    )
    const { workspaceService } = await import("../src/workspace/service")

    expect(typeof resolveWorkspaceCurrency).toBe("function")
    expect(typeof workspaceService.findById).toBe("function")
  })
})
