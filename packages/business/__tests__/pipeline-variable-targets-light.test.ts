// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

// Variable rendering loads this module on every message: it must not pull the
// pipeline or workspace services (and their cache, queue and Redis graph).
vi.mock("../src/workspace/service", () => {
  throw new Error("variable-targets must not load workspace/service")
})
vi.mock("../src/pipeline/currency", () => {
  throw new Error("variable-targets must not load pipeline/currency")
})
vi.mock("../src/pipeline/service", () => {
  throw new Error("variable-targets must not load the pipeline service")
})

describe("pipeline variable targets", () => {
  test("load without the pipeline or workspace services", async () => {
    const module = await import("../src/pipeline/variable-targets")

    expect(typeof module.loadPipelineVariableTargets).toBe("function")
  })
})
