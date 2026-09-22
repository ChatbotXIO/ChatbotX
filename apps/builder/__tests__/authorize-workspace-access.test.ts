import type { HTTPMethod } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { CONVERSATIONS_LIST_POST_PATH } from "@/features/conversations/lib/api-paths"

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
  assertWorkspaceOwnerAccessForMethod,
  checkWorkspaceOwnerAccess,
  isReadOnlyTokenAllowedMethod,
  isWorkspaceMutationMethod,
  workspaceAccessDenialException,
  workspaceAccessDenialOrpcError,
} = await import("@/lib/workspace/authorize-workspace-access")
const { ADS_CAMPAIGNS_INSIGHTS_PATH } = await import(
  "@/features/ads-campaign/lib/api-paths"
)

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

describe("assertWorkspaceOwnerAccessForMethod", () => {
  test("allows the conversation list POST but denies other POST routes", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      reason: "status",
      planName: null,
      status: "expired",
      trialEndsAt: null,
    })

    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "POST",
        path: CONVERSATIONS_LIST_POST_PATH,
        ownerId: "owner-1",
      }),
    ).resolves.toBeUndefined()
    expect(getAccessState).not.toHaveBeenCalled()

    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "POST",
        path: "/workspaces/{workspaceId}/conversations/assign",
        ownerId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "trialExpired" })
  })
  test("checks the owner gate for a prototype-key POST path", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({
      blocked: true,
      reason: "status",
      planName: null,
      status: "expired",
      trialEndsAt: null,
    })

    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "POST",
        path: "constructor",
        ownerId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "trialExpired" })

    expect(getAccessState).toHaveBeenCalledWith("owner-1")
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

describe("isReadOnlyTokenAllowedMethod", () => {
  test("allows GET/HEAD regardless of path", () => {
    expect(isReadOnlyTokenAllowedMethod("GET")).toBe(true)
    expect(isReadOnlyTokenAllowedMethod("HEAD")).toBe(true)
  })

  test("allows POST to the allowlisted ads campaigns insights path", () => {
    expect(
      isReadOnlyTokenAllowedMethod("POST", ADS_CAMPAIGNS_INSIGHTS_PATH),
    ).toBe(true)
  })

  test("rejects POST/PUT/PATCH to every other path", () => {
    expect(isReadOnlyTokenAllowedMethod("POST", "/v1/ads/campaigns")).toBe(
      false,
    )
    expect(
      isReadOnlyTokenAllowedMethod("PUT", ADS_CAMPAIGNS_INSIGHTS_PATH),
    ).toBe(false)
    expect(
      isReadOnlyTokenAllowedMethod("PATCH", ADS_CAMPAIGNS_INSIGHTS_PATH),
    ).toBe(false)
  })

  test("rejects POST with no path at all", () => {
    expect(isReadOnlyTokenAllowedMethod("POST")).toBe(false)
    expect(isReadOnlyTokenAllowedMethod("POST", undefined)).toBe(false)
  })

  test.each([
    "constructor",
    "toString",
  ])("rejects POST to the prototype-key path %s", (path) => {
    expect(isReadOnlyTokenAllowedMethod("POST", path)).toBe(false)
  })

  test("rejects POST to the conversations list path — it is allow-listed for the trial gate only, not for read_only tokens", () => {
    expect(
      isReadOnlyTokenAllowedMethod("POST", CONVERSATIONS_LIST_POST_PATH),
    ).toBe(false)
  })
})

describe("assertWorkspaceOwnerAccessForMethod", () => {
  test("allows the conversations list POST path for a trial-expired workspace", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "POST",
        ownerId: "owner-1",
        path: "/workspaces/{workspaceId}/conversations/list",
      }),
    ).resolves.toBeUndefined()
  })

  test("blocks a different POST path for a trial-expired workspace", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })

    await expect(
      assertWorkspaceOwnerAccessForMethod({
        method: "POST",
        ownerId: "owner-1",
        path: "/workspaces/{workspaceId}/conversations/archive",
      }),
    ).rejects.toMatchObject({ code: "trialExpired", status: 403 })
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
