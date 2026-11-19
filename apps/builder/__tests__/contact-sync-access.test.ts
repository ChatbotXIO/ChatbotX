// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  currentAccess: vi.fn(),
  configured: vi.fn(),
  findPagesAtSource: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactSyncService: { findPagesAtSource: mocks.findPagesAtSource },
}))
vi.mock("@chatbotx.io/integration-ahachat", () => ({
  isAhachatConfigured: mocks.configured,
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactPermissionScope: mocks.requireScope,
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mocks.currentAccess,
}))

const { findConnectPagesOnAhachat, requireContactSyncAdmin } = await import(
  "@/features/contact-sync/lib/access"
)

const access = (role: string, permissions: Record<string, unknown> = {}) => ({
  user: { id: "user-1" },
  targetWorkspaceMember: { role, permissions },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireScope.mockResolvedValue({ restrictToAssignedUserId: null })
  mocks.configured.mockReturnValue(true)
})

describe("requireContactSyncAdmin", () => {
  test.each([
    ["the owner", access("owner")],
    [
      "a superAdmin member (a support-access admin is one)",
      access("member", { superAdmin: true }),
    ],
  ])("lets %s through and names them as the actor", async (_label, value) => {
    mocks.currentAccess.mockResolvedValue(value)

    await expect(requireContactSyncAdmin("ws-1")).resolves.toEqual({
      userId: "user-1",
    })
    expect(mocks.requireScope).toHaveBeenCalledWith("ws-1")
  })

  test("refuses a plain member with the one contactSyncNotAdmin code", async () => {
    mocks.currentAccess.mockResolvedValue(access("member"))

    await expect(requireContactSyncAdmin("ws-1")).rejects.toMatchObject({
      code: "contactSyncNotAdmin",
      httpStatusCode: 403,
    })
  })

  test("refuses an admin limited to assigned contacts with the same code", async () => {
    mocks.requireScope.mockResolvedValue({ restrictToAssignedUserId: "user-1" })
    mocks.currentAccess.mockResolvedValue(access("owner"))

    await expect(requireContactSyncAdmin("ws-1")).rejects.toMatchObject({
      code: "contactSyncNotAdmin",
    })
  })

  test("refuses a caller who has no access to the workspace", async () => {
    mocks.currentAccess.mockResolvedValue(null)

    await expect(requireContactSyncAdmin("ws-1")).rejects.toMatchObject({
      code: "contactSyncNotAdmin",
    })
  })
})

describe("findConnectPagesOnAhachat", () => {
  const input = {
    workspaceId: "ws-1",
    channel: "messenger" as const,
    pageIds: ["p1", "p2"],
  }

  test("asks AhaChat about the session's pages as the signed-in admin", async () => {
    mocks.currentAccess.mockResolvedValue(access("owner"))
    mocks.findPagesAtSource.mockResolvedValue(["p2"])

    await expect(findConnectPagesOnAhachat(input)).resolves.toEqual(["p2"])
    expect(mocks.findPagesAtSource).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actor: { type: "user", id: "user-1" },
      pages: [
        { channel: "messenger", pageId: "p1" },
        { channel: "messenger", pageId: "p2" },
      ],
    })
  })

  test("finds none for a member who may not use the sync, without asking", async () => {
    mocks.currentAccess.mockResolvedValue(access("member"))

    await expect(findConnectPagesOnAhachat(input)).resolves.toEqual([])
    expect(mocks.findPagesAtSource).not.toHaveBeenCalled()
  })

  test("finds none when AhaChat is not configured, without asking", async () => {
    mocks.configured.mockReturnValue(false)

    await expect(findConnectPagesOnAhachat(input)).resolves.toEqual([])
    expect(mocks.currentAccess).not.toHaveBeenCalled()
    expect(mocks.findPagesAtSource).not.toHaveBeenCalled()
  })
})
