// @vitest-environment node

import { ORPCError } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError },
}))

const { logUnexpectedOrpcErrorCallback } = await import("@/lib/orpc/handlers")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("logUnexpectedOrpcErrorCallback", () => {
  test("skips a 4xx ORPCError — already warn-logged by mapKnownOrpcErrors", () => {
    logUnexpectedOrpcErrorCallback("test handler")(
      new ORPCError("UNAUTHORIZED"),
    )

    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("logs a 5xx ORPCError once at error level", () => {
    logUnexpectedOrpcErrorCallback("test handler")(
      new ORPCError("INTERNAL_SERVER_ERROR"),
    )

    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(ORPCError) }),
      "Error in test handler",
    )
  })

  test("logs a non-ORPC error once at error level", () => {
    logUnexpectedOrpcErrorCallback("test handler")(new Error("boom"))

    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Error in test handler",
    )
  })
})
