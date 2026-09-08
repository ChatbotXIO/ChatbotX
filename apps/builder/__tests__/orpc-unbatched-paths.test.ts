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

/**
 * The multi-select connect fan-out's whole point is N connects in flight at
 * the concurrency `useConnectBatch` chooses. `BatchLinkPlugin` would merge
 * them into ONE HTTP request — serializing the fan-out and collapsing every
 * per-call abort signal into `toBatchAbortSignal`'s all-or-nothing one — so
 * each connect procedure has to be excluded by name.
 */
describe("the connect procedures are never batched", () => {
  const connectProcedurePaths = [
    "integrationMessengerAPIs.connectMessengerPageAPI",
    "integrationInstagramAPIs.connectInstagramFacebookAccountAPI",
    "integrationInstagramAPIs.connectInstagramAccountAPI",
    "integrationWhatsappAPIs.connectWhatsappNumberAPI",
  ] as const

  test.each(
    connectProcedurePaths,
  )("%s is listed in UNBATCHED_PROCEDURE_PATHS", (procedurePath) => {
    expect(UNBATCHED_PROCEDURE_PATHS.has(procedurePath)).toBe(true)
  })

  test.each(
    connectProcedurePaths,
  )("%s is excluded from batching", (procedurePath) => {
    expect(isUnbatchedProcedure({ path: procedurePath.split(".") })).toBe(true)
  })
})
