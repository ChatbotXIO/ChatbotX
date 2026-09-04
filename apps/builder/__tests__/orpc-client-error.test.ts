// @vitest-environment node

import { ORPCError } from "@orpc/client"
import { describe, expect, test } from "vitest"
import { getClientErrorMessage } from "../src/lib/orpc/client-error"

describe("getClientErrorMessage", () => {
  test("surfaces the server's message for an ORPCError", () => {
    const error = new ORPCError("BAD_REQUEST", {
      message: "Slot is no longer available",
    })

    expect(getClientErrorMessage(error, "Failed to book")).toBe(
      "Slot is no longer available",
    )
  })

  test("falls back for anything that is not an ORPCError", () => {
    expect(getClientErrorMessage(new TypeError("Failed to fetch"), "x")).toBe(
      "x",
    )
    expect(getClientErrorMessage("string error", "x")).toBe("x")
    expect(getClientErrorMessage(undefined, "x")).toBe("x")
  })
})
