import type { HTTPMethod } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { getAccessState, isAtLimit, isCloud } = vi.hoisted(() => ({
  getAccessState: vi.fn(),
  isAtLimit: vi.fn(),
  isCloud: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: { isAtLimit },
  userQuotaService: { getAccessState },
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

vi.mock("@/env", () => ({ isCloud }))

const {
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod,
  workspaceAccessDenialException,
  workspaceAccessDenialOrpcError,
} = await import("@/lib/workspace/authorize-workspace-access")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkWorkspaceOwnerAccess", () => {
  test("returns null on self-hosted (non-cloud) regardless of quota state", async () => {
    isCloud.mockReturnValue(false)

    const result = await checkWorkspaceOwnerAccess({ ownerId: "owner-1" })

    expect(result).toBeNull()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("returns 'trialExpired' when the owner's access state is blocked for a non-mac reason", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      reason: "status",
      planName: null,
      status: "expired",
      trialEndsAt: null,
    })

    const result = await checkWorkspaceOwnerAccess({ ownerId: "owner-1" })

    expect(result).toBe("trialExpired")
  })

  test("returns 'macLimitReached' when already blocked for the mac reason", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      reason: "mac",
      planName: null,
      status: "active",
      trialEndsAt: null,
    })

    const result = await checkWorkspaceOwnerAccess({ ownerId: "owner-1" })

    expect(result).toBe("macLimitReached")
    expect(isAtLimit).not.toHaveBeenCalled()
  })

  test("returns 'macLimitReached' when not blocked by status but the pool is at the mac limit", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: false,
      reason: null,
      planName: "pro",
      status: "active",
      trialEndsAt: null,
    })
    isAtLimit.mockResolvedValue(true)

    const result = await checkWorkspaceOwnerAccess({ ownerId: "owner-1" })

    expect(result).toBe("macLimitReached")
    expect(isAtLimit).toHaveBeenCalledWith({ userId: "owner-1", metric: "mac" })
  })

  test("returns null when not blocked and under the mac limit", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: false,
      reason: null,
      planName: "pro",
      status: "active",
      trialEndsAt: null,
    })
    isAtLimit.mockResolvedValue(false)

    const result = await checkWorkspaceOwnerAccess({ ownerId: "owner-1" })

    expect(result).toBeNull()
  })
})

describe("isWorkspaceMutationMethod", () => {
  test.each<[HTTPMethod | undefined, boolean]>([
    ["GET", false],
    ["HEAD", false],
    ["DELETE", false],
    ["POST", true],
    ["PUT", true],
    ["PATCH", true],
    [undefined, true],
  ])("method %s → mutation=%s", (method, expected) => {
    expect(isWorkspaceMutationMethod(method)).toBe(expected)
  })
})

describe("workspaceAccessDenialException", () => {
  test("carries the reason as the code and a 403 status", () => {
    const error = workspaceAccessDenialException("trialExpired")

    expect(error.code).toBe("trialExpired")
    expect(error.httpStatusCode).toBe(403)
  })
})

describe("workspaceAccessDenialOrpcError", () => {
  test("carries the reason as the ORPCError code and a 403 status", () => {
    const error = workspaceAccessDenialOrpcError("macLimitReached")

    expect(error.code).toBe("macLimitReached")
    expect(error.status).toBe(403)
  })
})
