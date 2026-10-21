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
}))

vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findUserByIdOrFail },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))

const { invitationService } = await import("../src/invitation/service")

const TENANT_A = "tenant-a"
const TENANT_B = "tenant-b"
// 16 random bytes, base64url, no padding.
const BASE64URL_16_BYTES = /^[A-Za-z0-9_-]{22}$/

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
    mocks.findWorkspace.mockResolvedValue({ tenantId: TENANT_A })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("inserts a one-day invite code generated from a CSPRNG, not a sequential id", async () => {
    const permissions = { superAdmin: true } as never

    const [first, second] = await Promise.all([
      invitationService.create({
        workspaceId: "ws-1",
        invitedBy: "user-1",
        permissions,
      }),
      invitationService.create({
        workspaceId: "ws-1",
        invitedBy: "user-1",
        permissions,
      }),
    ])

    expect(first).toEqual({ id: "invitation-1" })
    expect(second).toEqual({ id: "invitation-1" })
    const [firstCall, secondCall] = mocks.values.mock.calls
    const firstCode = firstCall?.[0].code as string
    const secondCode = secondCall?.[0].code as string
    expect(firstCode).toMatch(BASE64URL_16_BYTES)
    expect(secondCode).toMatch(BASE64URL_16_BYTES)
    expect(firstCode).not.toBe(secondCode)
    expect(firstCall?.[0]).toMatchObject({
      id: "invitation-1",
      permissions,
      expiresAt: new Date("2026-10-09T00:00:00.000Z"),
      workspaceId: "ws-1",
      invitedBy: "user-1",
    })
  })

  test("returns an active invitation in its own tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toBe(activeInvitation)
  })

  test("rejects an expired invitation", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toBeNull()
  })

  test("rejects an invitation without a workspace", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      workspaceId: null,
    })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toBeNull()
  })

  test("rejects an invitation from another tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: TENANT_B })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toBeNull()
    expect(mocks.findWorkspace).toHaveBeenCalledWith({
      where: { id: activeInvitation.workspaceId },
    })
  })

  test("preserves the expired invitation error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })

    await expect(
      invitationService.findActiveByCodeOrFail(activeInvitation.code, TENANT_A),
    ).rejects.toThrow("Invitation expired")
  })

  test("preserves the missing workspace error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      workspaceId: null,
    })

    await expect(
      invitationService.findActiveByCodeOrFail(activeInvitation.code, TENANT_A),
    ).rejects.toThrow("Invalid invitation: no workspace associated")
  })

  test("rejects acceptance of a cross-tenant code the same as an unknown one", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: TENANT_B })

    await expect(
      invitationService.findActiveByCodeOrFail(activeInvitation.code, TENANT_A),
    ).rejects.toThrow("Invitation not found")
  })

  test("loads a trimmed summary with no workspace token or inviter email", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findUserByIdOrFail.mockResolvedValue({
      id: activeInvitation.invitedBy,
      name: "Ada",
      image: "ada.png",
      email: "ada@example.com",
    })
    mocks.findWorkspace.mockResolvedValue({
      id: activeInvitation.workspaceId,
      tenantId: TENANT_A,
      name: "Acme",
      logo: "acme-logo.png",
      scheduledDeletionAt: null,
      token: "legacy-plaintext-api-key",
    })

    await expect(
      invitationService.getInvitationDetails(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toEqual({
      code: activeInvitation.code,
      expiresAt: activeInvitation.expiresAt,
      workspace: {
        name: "Acme",
        logo: "acme-logo.png",
        scheduledDeletionAt: null,
      },
      inviter: { name: "Ada", image: "ada.png" },
    })
  })

  test("returns null for a cross-tenant code instead of throwing", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: TENANT_B })

    await expect(
      invitationService.getInvitationDetails(activeInvitation.code, {
        tenantId: TENANT_A,
      }),
    ).resolves.toBeNull()
    expect(mocks.findUserByIdOrFail).not.toHaveBeenCalled()
  })
})
