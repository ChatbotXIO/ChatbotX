// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  isUnbatchedProcedure,
  UNBATCHED_PROCEDURE_PATHS,
} from "@/lib/orpc/orpc"

describe("isUnbatchedProcedure", () => {
  test.each([
    ...UNBATCHED_PROCEDURE_PATHS,
  ])("returns true for the UNBATCHED_PROCEDURE_PATHS entry %s", (procedurePath) => {
    expect(isUnbatchedProcedure({ path: procedurePath.split(".") })).toBe(true)
  })

  test("returns true for any sse.* path", () => {
    expect(isUnbatchedProcedure({ path: ["sse", "anything"] })).toBe(true)
    expect(isUnbatchedProcedure({ path: ["sse"] })).toBe(true)
  })

  test("returns false for a batched procedure path", () => {
    expect(
      isUnbatchedProcedure({ path: ["aiAgentsAPI", "listAIAgentsAPI"] }),
    ).toBe(false)
  })
})
