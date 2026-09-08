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
  toPublicErrorMessage: (error: Error, fallback: string) =>
    error.message || fallback,
}))

vi.mock("@chatbotx.io/database/errors", () => ({
  ModelNotfoundException: class ModelNotfoundException extends Error {},
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {
    httpStatusCode?: number
    constructor(message: string, httpStatusCode?: number) {
      super(message)
      this.name = "SdkException"
      this.httpStatusCode = httpStatusCode
    }
  },
}))

// `@/orpc` now attaches `commonApiErrors` (from orpc-error-helper.ts) to the
// public stacks, which reuses `DENIAL_MESSAGES` from this module — stub it so
// importing `@/orpc` doesn't pull in the real `@chatbotx.io/business` barrel
// (and transitively the google-calendar integration's `@chatbotx.io/sdk`
// `Integration` export, which the mock above doesn't provide).
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  DENIAL_MESSAGES: {
    trialExpired: "Trial expired",
    macLimitReached: "Monthly active contact limit reached",
  },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { ModelNotfoundException } = await import("@chatbotx.io/database/errors")
const { SdkException } = await import("@chatbotx.io/sdk")
const { ActionValidationError } = await import("next-safe-action")
const { ORPCError } = await import("@orpc/server")

const { mapKnownOrpcErrors } = await import("@/orpc")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("mapKnownOrpcErrors", () => {
  test("maps a ChatbotXException subclass via instanceof, not error.name", () => {
    class SlotUnavailableException extends ChatbotXException {
      constructor() {
        super("Slot unavailable", "slotUnavailable", 409)
        this.name = "SlotUnavailableException"
      }
    }

    expect(() => mapKnownOrpcErrors(new SlotUnavailableException())).toThrow(
      expect.objectContaining({ code: "slotUnavailable", status: 409 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("maps ModelNotfoundException to a 404 notFound", () => {
    expect(() =>
      mapKnownOrpcErrors(new ModelNotfoundException("Flow not found")),
    ).toThrow(expect.objectContaining({ code: "notFound", status: 404 }))
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps SdkException to a 400 BAD_REQUEST using the provider's public message", () => {
    const error = new SdkException("(#100) Invalid parameter", 400)

    expect(() => mapKnownOrpcErrors(error)).toThrow(
      expect.objectContaining({
        code: "BAD_REQUEST",
        status: 400,
        message: "(#100) Invalid parameter",
      }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps ActionValidationError to a 422 invalidRequestData", () => {
    const error = new ActionValidationError({ name: { _errors: ["bad"] } })

    expect(() => mapKnownOrpcErrors(error)).toThrow(
      expect.objectContaining({ code: "invalidRequestData", status: 422 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps a validationException-shaped ChatbotXException to a 422 validation error", () => {
    const error = new ChatbotXException("Name already taken", "validation", 422)

    expect(() => mapKnownOrpcErrors(error)).toThrow(
      expect.objectContaining({ code: "validation", status: 422 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps a tooManyRequests ChatbotXException to a 429 error", () => {
    const error = new ChatbotXException(
      "Too many requests. Retry after 5s.",
      "tooManyRequests",
      429,
    )

    expect(() => mapKnownOrpcErrors(error)).toThrow(
      expect.objectContaining({ code: "tooManyRequests", status: 429 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1)
  })

  test("maps a 5xx ChatbotXException without warn-logging — the route callback logs it once", () => {
    const error = new ChatbotXException("boom", "upstream", 502)

    expect(() => mapKnownOrpcErrors(error)).toThrow(
      expect.objectContaining({ code: "upstream", status: 502 }),
    )
    expect(mockLoggerWarn).not.toHaveBeenCalled()
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("leaves a plain ORPCError untouched and does not log", () => {
    const error = new ORPCError("UNAUTHORIZED")

    expect(() => mapKnownOrpcErrors(error)).not.toThrow()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
    expect(mockLoggerError).not.toHaveBeenCalled()
  })

  test("does not throw or log for an unknown error — left for the route's logUnexpectedOrpcError", () => {
    const error = new Error("unexpected")

    expect(() => mapKnownOrpcErrors(error)).not.toThrow()
    expect(mockLoggerError).not.toHaveBeenCalled()
    expect(mockLoggerWarn).not.toHaveBeenCalled()
  })
})
