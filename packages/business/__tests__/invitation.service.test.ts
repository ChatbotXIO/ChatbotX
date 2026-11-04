import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const TRAILING_SLASHES = /\/+$/

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  findByCode: vi.fn(),
  findUserByIdOrFail: vi.fn(),
  findWorkspace: vi.fn(),
  loggerDebug: vi.fn(),
  resolveServingHost: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  invitationRepository: {
    create: mocks.createInvitation,
    findByCode: mocks.findByCode,
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "invitation-1",
}))

vi.mock("@chatbotx.io/utils/web-url", () => ({
  joinAppUrl: (appUrl: string, path: string) =>
    `${appUrl.replace(TRAILING_SLASHES, "")}${path}`,
}))

vi.mock("../src/logger", () => ({
  logger: { debug: mocks.loggerDebug },
}))

vi.mock("../src/platform/settings", () => ({
  resolveServingHost: mocks.resolveServingHost,
}))

vi.mock("../src/user/service", () => ({
  userService: { findByIdOrFail: mocks.findUserByIdOrFail },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))

const { invitationService } = await import("../src/invitation/service")

const ROOT_TENANT_ID = "root"
const RESELLER_TENANT_ID = "tenant-reseller"
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
  const useActiveResellerHost = () => {
    mocks.findWorkspace.mockResolvedValue({ tenantId: RESELLER_TENANT_ID })
    mocks.resolveServingHost.mockResolvedValue({
      tenantId: RESELLER_TENANT_ID,
      appUrl: "https://chat.reseller.test",
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"))
    mocks.createInvitation.mockResolvedValue({ id: "invitation-1" })
    mocks.findWorkspace.mockResolvedValue({ tenantId: ROOT_TENANT_ID })
    mocks.resolveServingHost.mockResolvedValue({
      tenantId: ROOT_TENANT_ID,
      appUrl: "https://app.chatbotx.test/",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("creates a one-day invite code generated from a CSPRNG, not a sequential id", async () => {
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
    const [firstCall, secondCall] = mocks.createInvitation.mock.calls
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

  test("serves root workspaces only from the platform tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)
    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: RESELLER_TENANT_ID,
      }),
    ).resolves.toBeNull()
  })

  test("serves an active reseller workspace with an active domain only from its reseller tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    useActiveResellerHost()

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: RESELLER_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)
    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBeNull()
  })

  test("serves a suspended reseller workspace from the platform tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: RESELLER_TENANT_ID })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)
    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: RESELLER_TENANT_ID,
      }),
    ).resolves.toBeNull()
  })

  test("serves an active reseller workspace with no active domain from the platform tenant", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue({ tenantId: RESELLER_TENANT_ID })

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)
  })

  test("builds host-correct invite URLs as the serving tenant changes", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    const workspace = { tenantId: RESELLER_TENANT_ID } as never

    useActiveResellerHost()
    await expect(
      invitationService.buildInviteUrl({
        code: activeInvitation.code,
        workspace,
      }),
    ).resolves.toBe("https://chat.reseller.test/invitations/invite-code")
    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: RESELLER_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)

    mocks.resolveServingHost.mockResolvedValue({
      tenantId: ROOT_TENANT_ID,
      appUrl: "https://app.chatbotx.test/",
    })
    await expect(
      invitationService.buildInviteUrl({
        code: activeInvitation.code,
        workspace,
      }),
    ).resolves.toBe("https://app.chatbotx.test/invitations/invite-code")
    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBe(activeInvitation)
  })

  test("builds platform invite URLs for root workspaces and resellers without an active host", async () => {
    await expect(
      invitationService.buildInviteUrl({
        code: activeInvitation.code,
        workspace: { tenantId: ROOT_TENANT_ID } as never,
      }),
    ).resolves.toBe("https://app.chatbotx.test/invitations/invite-code")

    await expect(
      invitationService.buildInviteUrl({
        code: activeInvitation.code,
        workspace: { tenantId: RESELLER_TENANT_ID } as never,
      }),
    ).resolves.toBe("https://app.chatbotx.test/invitations/invite-code")
  })

  test("logs a tenant mismatch without logging the bearer code", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)

    await expect(
      invitationService.findActiveByCode(activeInvitation.code, {
        tenantId: RESELLER_TENANT_ID,
      }),
    ).resolves.toBeNull()

    expect(mocks.loggerDebug).toHaveBeenCalledWith(
      {
        invitationId: activeInvitation.id,
        reason: "tenant_mismatch",
        requestTenantId: RESELLER_TENANT_ID,
        servingTenantId: ROOT_TENANT_ID,
        workspaceId: activeInvitation.workspaceId,
      },
      "Invitation lookup rejected",
    )
  })

  test("logs unknown, expired, and workspace-less invitation lookups without exposing their codes", async () => {
    mocks.findByCode.mockResolvedValueOnce(null)
    await invitationService.findActiveByCode(activeInvitation.code, {
      tenantId: ROOT_TENANT_ID,
    })

    mocks.findByCode.mockResolvedValueOnce({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })
    await invitationService.findActiveByCode(activeInvitation.code, {
      tenantId: ROOT_TENANT_ID,
    })

    mocks.findByCode.mockResolvedValueOnce({
      ...activeInvitation,
      workspaceId: null,
    })
    await invitationService.findActiveByCode(activeInvitation.code, {
      tenantId: ROOT_TENANT_ID,
    })

    expect(mocks.loggerDebug).toHaveBeenNthCalledWith(
      1,
      { reason: "not_found" },
      "Invitation lookup rejected",
    )
    expect(mocks.loggerDebug).toHaveBeenNthCalledWith(
      2,
      { invitationId: activeInvitation.id, reason: "expired" },
      "Invitation lookup rejected",
    )
    expect(mocks.loggerDebug).toHaveBeenNthCalledWith(
      3,
      { invitationId: activeInvitation.id, reason: "no_workspace" },
      "Invitation lookup rejected",
    )
  })

  test("preserves the expired invitation error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      expiresAt: new Date("2026-10-07T00:00:00.000Z"),
    })

    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).rejects.toThrow("Invitation expired")
  })

  test("preserves the missing workspace error for acceptance", async () => {
    mocks.findByCode.mockResolvedValue({
      ...activeInvitation,
      workspaceId: null,
    })

    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).rejects.toThrow("Invalid invitation: no workspace associated")
  })

  test("preserves the not-found error when a referenced workspace is missing", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    mocks.findWorkspace.mockResolvedValue(null)

    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).rejects.toThrow("Invitation not found")
  })

  test("uses the serving-tenant matrix when accepting invitations", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)

    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).resolves.toBe(activeInvitation)
    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        RESELLER_TENANT_ID,
      ),
    ).rejects.toThrow("Invitation not found")

    useActiveResellerHost()
    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        RESELLER_TENANT_ID,
      ),
    ).resolves.toBe(activeInvitation)
    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).rejects.toThrow("Invitation not found")

    mocks.resolveServingHost.mockResolvedValue({
      tenantId: ROOT_TENANT_ID,
      appUrl: "https://app.chatbotx.test/",
    })
    await expect(
      invitationService.findActiveByCodeOrFail(
        activeInvitation.code,
        ROOT_TENANT_ID,
      ),
    ).resolves.toBe(activeInvitation)
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
      tenantId: ROOT_TENANT_ID,
      name: "Acme",
      logo: "acme-logo.png",
      scheduledDeletionAt: null,
      token: "legacy-plaintext-api-key",
    })

    await expect(
      invitationService.getInvitationDetails(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
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
    expect(mocks.findWorkspace).toHaveBeenCalledTimes(1)
  })

  test("returns null for a cross-tenant code instead of throwing", async () => {
    mocks.findByCode.mockResolvedValue(activeInvitation)
    useActiveResellerHost()

    await expect(
      invitationService.getInvitationDetails(activeInvitation.code, {
        tenantId: ROOT_TENANT_ID,
      }),
    ).resolves.toBeNull()
    expect(mocks.findUserByIdOrFail).not.toHaveBeenCalled()
  })
})
