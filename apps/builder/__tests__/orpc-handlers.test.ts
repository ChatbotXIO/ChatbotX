// @vitest-environment node

import { ORPCError } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoggerError, mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError, info: mockLoggerInfo },
}))

const { logUnexpectedOrpcErrorCallback, createTimingInterceptor } =
  await import("@/lib/orpc/handlers")

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

describe("createTimingInterceptor", () => {
  test("logs method, path, status, and a non-negative duration for a matched request", async () => {
    const interceptor = createTimingInterceptor("test handler")

    const result = await interceptor({
      request: {
        method: "GET",
        url: new URL("https://example.com/api/v1/contacts"),
      },
      next: () =>
        Promise.resolve({
          matched: true,
          response: { status: 200, headers: {}, body: undefined },
        }),
    })

    expect(result.matched).toBe(true)
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1)
    const [fields, message] = mockLoggerInfo.mock.calls[0]
    expect(message).toBe("oRPC request")
    expect(fields).toMatchObject({
      label: "test handler",
      method: "GET",
      path: "/api/v1/contacts",
      status: 200,
    })
    expect(fields.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("logs with status undefined when no route matched (404)", async () => {
    const interceptor = createTimingInterceptor("test handler")

    await interceptor({
      request: {
        method: "GET",
        url: new URL("https://example.com/api/v1/unknown"),
      },
      next: () => Promise.resolve({ matched: false, response: undefined }),
    })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
      "oRPC request",
    )
  })

  test("propagates the result from next() unchanged", async () => {
    const interceptor = createTimingInterceptor("test handler")
    const response = { status: 204, headers: {}, body: undefined }

    const result = await interceptor({
      request: { method: "DELETE", url: new URL("https://example.com/api") },
      next: () => Promise.resolve({ matched: true, response }),
    })

    expect(result).toEqual({ matched: true, response })
  })
})
