import { describe, expect, test } from "vitest"
import {
  isDurableFlowExecutionKey,
  mintRandomFlowExecutionKey,
} from "../src/integration/flow-execution-key"

describe("flow execution key", () => {
  test("a job id with its creation time is durable", () => {
    expect(isDurableFlowExecutionKey("42:1760000000000")).toBe(true)
  })

  test.each([
    "flow-inline-",
    "integration-job-",
  ] as const)("a minted %s key is not durable", (prefix) => {
    expect(isDurableFlowExecutionKey(mintRandomFlowExecutionKey(prefix))).toBe(
      false,
    )
  })

  test("a missing or empty key is not durable", () => {
    expect(isDurableFlowExecutionKey(undefined)).toBe(false)
    expect(isDurableFlowExecutionKey("")).toBe(false)
  })
})
