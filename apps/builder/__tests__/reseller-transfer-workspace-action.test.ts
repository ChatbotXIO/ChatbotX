// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transfer: vi.fn(),
  findOrFail: vi.fn(),
  getCurrentUserId: vi.fn().mockResolvedValue("reseller-1"),
  getManageAccess: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: vi.fn(),
  workspaceService: {
    transferSubAccountWorkspaceToOwner: mocks.transfer,
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: () => undefined,
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mocks.findOrFail,
  isDatabaseError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({ userModel: {} }))

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}))

vi.mock("@/app/manage/reseller-guard", () => ({
  getManageAccess: mocks.getManageAccess,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
  workspaceAccessDenialException: (reason: string) => new Error(reason),
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
}))

vi.mock("@/lib/log", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}))

const { transferWorkspaceToOwnerAction } = await import(
  "../src/features/reseller-workspaces/actions/transfer-workspace-to-owner.action"
)

type ActionResult = { data?: unknown; serverError?: string }
type Action = (input: unknown) => Promise<ActionResult>

const callAction = (input: unknown) =>
  (transferWorkspaceToOwnerAction as unknown as Action)(input)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUserId.mockResolvedValue("reseller-1")
  mocks.findOrFail.mockResolvedValue({
    id: "reseller-1",
    mustChangePassword: false,
  })
  mocks.getManageAccess.mockResolvedValue({ canManageReseller: true })
  mocks.transfer.mockResolvedValue({
    previousOwnerId: "sub-1",
    removedUserIds: ["sub-1"],
  })
})

describe("transferWorkspaceToOwnerAction", () => {
  test("rejects a caller who is not an active reseller", async () => {
    mocks.getManageAccess.mockResolvedValue({ canManageReseller: false })

    const result = await callAction({ workspaceId: "123" })

    expect(result.serverError).toBeTruthy()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })

  test("calls the service with the signed-in user as reseller and actor, never input", async () => {
    const result = await callAction({ workspaceId: "123" })

    expect(mocks.transfer).toHaveBeenCalledWith({
      resellerUserId: "reseller-1",
      workspaceId: "123",
      actorUserId: "reseller-1",
    })
    expect(result.data).toEqual({
      previousOwnerId: "sub-1",
      removedUserIds: ["sub-1"],
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/manage/sub-account-workspaces",
    )
  })

  test("ignores an injected resellerUserId in the input", async () => {
    await callAction({ workspaceId: "123", resellerUserId: "attacker-9" })

    expect(mocks.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ resellerUserId: "reseller-1" }),
    )
  })

  test("rejects an invalid workspace id without calling the service", async () => {
    const result = await callAction({ workspaceId: "not-a-number" })

    expect(result.serverError ?? "validationErrors").toBeTruthy()
    expect(mocks.transfer).not.toHaveBeenCalled()
  })
})
