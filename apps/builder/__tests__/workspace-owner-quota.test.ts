// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  workspaceActionClient,
  workspaceActionClientAllowScheduledDeletion,
} from "@/lib/safe-action"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

const { getAccessState, getAtLimitMap, getForUser, isAtLimit, isCloud } =
  vi.hoisted(() => ({
    getAccessState: vi.fn(),
    getAtLimitMap: vi.fn(),
    getForUser: vi.fn(),
    isAtLimit: vi.fn(),
    isCloud: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  isPlatformAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  quotaEnforcementService: { getAtLimitMap, isAtLimit },
  userQuotaService: { getAccessState, getAtLimitMap, getForUser },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({ userModel: {} }))

vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: () => ({ safeParse: () => ({ data: null }) }),
}))

vi.mock("@/env", () => ({ isCloud }))
vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))
vi.mock("@/lib/auth/utils", () => ({ getCurrentUserId: vi.fn() }))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))

function createChain(middlewares: unknown[] = []) {
  return {
    middlewares,
    use(middleware: unknown) {
      return createChain([...middlewares, middleware])
    },
  }
}

vi.mock("next-safe-action", () => ({
  DEFAULT_SERVER_ERROR_MESSAGE: "Server error",
  createSafeActionClient: () => createChain(),
}))

const activeQuota = {
  planStatus: "active",
  periodEnd: null,
}
const expiredQuota = {
  planStatus: "expired",
  periodEnd: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  isCloud.mockReturnValue(true)
  getAtLimitMap.mockResolvedValue({ mac: false })
  getForUser.mockResolvedValue(activeQuota)
  isAtLimit.mockResolvedValue(false)
})

describe("resolveWorkspaceBlockState", () => {
  test("uses the active workspace owner quota when a member has an expired personal quota", async () => {
    const result = await resolveWorkspaceBlockState("owner-active")

    expect(result).toMatchObject({ blocked: false, blockReason: null })
    expect(getForUser).toHaveBeenCalledWith("owner-active")
    expect(getAtLimitMap).toHaveBeenCalledWith("owner-active")
  })

  test("blocks a member when the workspace owner quota is expired", async () => {
    getForUser.mockResolvedValue(expiredQuota)

    await expect(
      resolveWorkspaceBlockState("owner-expired"),
    ).resolves.toMatchObject({
      blocked: true,
      blockReason: "status",
    })
    expect(getForUser).toHaveBeenCalledWith("owner-expired")
  })

  test("never blocks a self-hosted workspace", async () => {
    isCloud.mockReturnValue(false)

    await expect(resolveWorkspaceBlockState("owner-id")).resolves.toEqual({
      blocked: false,
      blockReason: null,
      quota: null,
      trialEndsAt: null,
    })
    expect(getForUser).not.toHaveBeenCalled()
    expect(getAtLimitMap).not.toHaveBeenCalled()
  })
})

describe("workspace action quota gates", () => {
  const workspace = { id: "workspace-id", ownerId: "owner-id" }
  const user = { id: "member-with-an-expired-personal-quota" }

  test("allows an action when the owner is active regardless of the member quota", async () => {
    getAccessState.mockResolvedValue({ blocked: false, reason: null })
    const next = vi.fn()
    const actionGate = (
      workspaceActionClient as unknown as {
        middlewares: Array<(args: unknown) => Promise<unknown>>
      }
    ).middlewares[2]

    await actionGate?.({ ctx: { user, workspace }, next })

    expect(getAccessState).toHaveBeenCalledWith("owner-id")
    expect(isAtLimit).toHaveBeenCalledWith({
      userId: "owner-id",
      metric: "mac",
    })
    expect(next).toHaveBeenCalledWith({ ctx: { user, workspace } })
  })

  test("rejects an action when the owner is expired even if the member is active", async () => {
    getAccessState.mockResolvedValue({ blocked: true, reason: "status" })
    const actionGate = (
      workspaceActionClient as unknown as {
        middlewares: Array<(args: unknown) => Promise<unknown>>
      }
    ).middlewares[2]

    await expect(
      actionGate?.({ ctx: { user, workspace }, next: vi.fn() }),
    ).rejects.toThrow("Trial expired")
    expect(getAccessState).toHaveBeenCalledWith("owner-id")
  })

  test("rejects a direct action when the owner's reseller pool reaches its MAC limit", async () => {
    getAccessState.mockResolvedValue({ blocked: false, reason: null })
    isAtLimit.mockResolvedValue(true)
    const actionGate = (
      workspaceActionClient as unknown as {
        middlewares: Array<(args: unknown) => Promise<unknown>>
      }
    ).middlewares[2]

    await expect(
      actionGate?.({ ctx: { user, workspace }, next: vi.fn() }),
    ).rejects.toThrow("Monthly active contact limit reached")
    expect(isAtLimit).toHaveBeenCalledWith({
      userId: "owner-id",
      metric: "mac",
    })
  })

  test("uses the owner quota for actions allowed during scheduled deletion", async () => {
    getAccessState.mockResolvedValue({ blocked: false, reason: null })
    const next = vi.fn()
    const actionGate = (
      workspaceActionClientAllowScheduledDeletion as unknown as {
        middlewares: Array<(args: unknown) => Promise<unknown>>
      }
    ).middlewares[2]

    await actionGate?.({ ctx: { user, workspace }, next })

    expect(getAccessState).toHaveBeenCalledWith("owner-id")
    expect(next).toHaveBeenCalledWith({ ctx: { user, workspace } })
  })
})
