// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoggerError, mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn },
}))

vi.mock("@/middlewares/auth", () => ({ authMiddleware: {} }))
vi.mock("@/middlewares/channel-api-token-auth", () => ({
  channelApiTokenAuthMidddleware: {},
}))
vi.mock("@/middlewares/workspace-token-auth", () => ({
  workspaceTokenAuthMidddleware: {},
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.name = "ChatbotXException"
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/database/errors", () => ({
  ModelNotfoundException: class ModelNotfoundException extends Error {},
}))

// Captures the callback passed to `onError(...)` so the test can invoke it
// directly, without needing a full oRPC procedure/handler pipeline.
const { onErrorCallbacks } = vi.hoisted(() => ({
  onErrorCallbacks: [] as ((error: unknown) => void)[],
}))

vi.mock("@orpc/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@orpc/server")>()
  return {
    ...actual,
    onError: (fn: (error: unknown) => void) => {
      onErrorCallbacks.push(fn)
      return actual.onError(fn)
    },
  }
})

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { ModelNotfoundException } = await import("@chatbotx.io/database/errors")
const { ActionValidationError } = await import("next-safe-action")

await import("@/orpc")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("oRPC error mapping", () => {
  const onErrorCallback = () => {
    const fn = onErrorCallbacks.at(0)
    expect(fn).toBeDefined()
    return fn as (error: unknown) => void
  }

  test("maps a ChatbotXException subclass via instanceof, not error.name", () => {
    class SlotUnavailableException extends ChatbotXException {
      constructor() {
        super("Slot unavailable", "slotUnavailable", 409)
        this.name = "SlotUnavailableException"
      }
    }

    expect(() => onErrorCallback()(new SlotUnavailableException())).toThrow(
      expect.objectContaining({ code: "slotUnavailable", status: 409 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("maps ModelNotfoundException to a 404 notFound", () => {
    expect(() =>
      onErrorCallback()(new ModelNotfoundException("Flow not found")),
    ).toThrow(expect.objectContaining({ code: "notFound", status: 404 }))
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps ActionValidationError to a 422 invalidRequestData", () => {
    const error = new ActionValidationError({ name: { _errors: ["bad"] } })

    expect(() => onErrorCallback()(error)).toThrow(
      expect.objectContaining({ code: "invalidRequestData", status: 422 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("logs an unknown error at error level and does not map/throw", () => {
    const error = new Error("unexpected")

    expect(() => onErrorCallback()(error)).not.toThrow()
    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
