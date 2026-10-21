import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))
  return {
    findByCode: vi.fn(),
    findUserByIdOrFail: vi.fn(),
    findWorkspace: vi.fn(),
    insert,
    returning,
    values,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: mocks.insert },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  invitationRepository: { findByCode: mocks.findByCode },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  invitationModel: { _: "Invitation" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "invitation-1",
  SymbolicSnowflakeIDs: { generate: () => "invite-code" },
}))

vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findUserByIdOrFail },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))

const { invitationService } = await import("../src/invitation/service")

const activeInvitation = {
  code: "invite-code",
  expiresAt: new Date("2026-10-09T00:00:00.000Z"),
  id: "invitation-1",
  invitedBy: "user-1",
  permissions: {},
  workspaceId: "workspace-1",
} as never

describe("invitationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"))
    mocks.returning.mockResolvedValue([{ id: "invitation-1" }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("inserts a one-day invite code and returns the row", async () => {
    const permissions = { superAdmin: true } as never

    const invitation = await invitationService.create({
      workspaceId: "ws-1",
      invitedBy: "user-1",
      permissions,
    })

    expect(invitation).toEqual({ id: "invitation-1" })
    expect(mocks.values).toHaveBeenCalledWith({
      id: "invitation-1",
      code: "invite-code",
      permissions,
      expiresAt: new Date("2026-10-09T00:00:00.000Z"),
      workspaceId: "ws-1",
      invitedBy: "user-1",
    })
  })

  test("returns an active invitation", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)

    await expect(
      invitationService.findActiveByCode(activeInvitation.code),
    ).resolves.toBe(activeInvitation)
  })

  test("rejects an expired invitation", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code),
    ).resolves.toBeNull()
  })

  test("rejects an invitation without a workspace", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      workspaceId: null,
    })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code),
    ).resolves.toBeNull()
  })

  test("preserves the expired invitation error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })

    await expect(
      invitationService.findActiveByCodeOrFail(activeInvitation.code),
    ).rejects.toThrow("Invitation expired")
  })

  test("preserves the missing workspace error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      workspaceId: null,
    })

    await expect(
      invitationService.findActiveByCodeOrFail(activeInvitation.code),
    ).rejects.toThrow("Invalid invitation: no workspace associated")
  })

  test("rejects an invitation from another tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: "tenant-b" })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: "tenant-a",
      }),
    ).resolves.toBeNull()
    expect(mocks.findWorkspace).toHaveBeenCalledWith({
      where: { id: activeInvitation.workspaceId },
    })
  })

  test("loads the invitation, inviter, and workspace details", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findUserByIdOrFail.mockResolvedValue({
      id: activeInvitation.invitedBy,
    })
    mocks.findWorkspace.mockResolvedValue({ id: activeInvitation.workspaceId })

    await expect(
      invitationService.getInvitationDetails(activeInvitation.code),
    ).resolves.toEqual({
      invitation: activeInvitation,
      user: { id: activeInvitation.invitedBy },
      workspace: { id: activeInvitation.workspaceId },
    })
  })
})
