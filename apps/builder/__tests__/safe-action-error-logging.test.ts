// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isDatabaseError: vi.fn().mockReturnValue(false),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn(),
  resolveWorkspaceAccess: vi.fn(),
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: () => undefined,
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  userModel: {},
}))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {
    httpStatusCode: number
    constructor(message: string, httpStatusCode = 400) {
      super(message)
      this.name = "SdkException"
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: vi.fn(),
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: vi.fn(),
  workspaceAccessDenialException: (reason: string) => new Error(reason),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}))

const { ChatbotXException, notFoundException, validationException } =
  await import("@chatbotx.io/business/errors")
const { SdkException } = await import("@chatbotx.io/sdk")
const { actionClient } = await import("@/lib/safe-action")

function buildFailingAction(error: unknown) {
  return actionClient.action(() => {
    throw error
  })
}

async function runFailingAction(error: unknown) {
  const action = buildFailingAction(error)
  return await (
    action as unknown as (input: unknown) => Promise<{ serverError?: string }>
  )(undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isDatabaseError.mockReturnValue(false)
})

describe("actionClient.handleServerError — ChatbotXException / SdkException logging", () => {
  // Regression test for the PR #1098 refactor: `findOrFail` (which threw a
  // bare `ModelNotfoundException extends Error`) was replaced by
  // `notFoundException` (a `ChatbotXException`) at several call sites.
  // `ChatbotXException` returns early in `handleServerError` — without this
  // warn call, every one of those not-found rejections vanished from the
  // logs entirely, unlike the `ModelNotfoundException` throws that used to
  // fall through to the generic `logger.error` branch below.
  test("warn-logs a 4xx ChatbotXException (e.g. notFoundException) instead of dropping it silently", async () => {
    const error = notFoundException("Workspace member not found")

    const result = await runFailingAction(error)

    expect(result.serverError).toBe("Workspace member not found")
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err: error },
      "Action rejected request",
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test("warn-logs a 4xx validationException", async () => {
    const error = validationException("name", "Name already exists")

    const result = await runFailingAction(error)

    expect(result.serverError).toBe("Name already exists")
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err: error },
      "Action rejected request",
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test("error-logs a 5xx ChatbotXException instead of warn", async () => {
    const error = new ChatbotXException("Boom", "systemError", 500)

    const result = await runFailingAction(error)

    expect(result.serverError).toBe("Boom")
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: error },
      "Action rejected request",
    )
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  test("warn-logs a 4xx SdkException", async () => {
    const error = new SdkException("Channel rejected", 422)

    const result = await runFailingAction(error)

    expect(result.serverError).toBe("Channel rejected")
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { err: error },
      "Action rejected request",
    )
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  test("still error-logs an unrecognized thrown error with the default message", async () => {
    const error = new Error("Unexpected")

    const result = await runFailingAction(error)

    expect(result.serverError).toBeDefined()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: error },
      "Error in actionClient",
    )
  })

  test("logs a database error at error level with a generic message", async () => {
    mocks.isDatabaseError.mockReturnValue(true)
    const error = new Error("connection reset")

    const result = await runFailingAction(error)

    expect(result.serverError).toBeDefined()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: error },
      "Database error in actionClient",
    )
  })
})
