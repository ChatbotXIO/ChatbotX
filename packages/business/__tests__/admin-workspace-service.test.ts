import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findIdByEmail: vi.fn(),
  findOrProvisionRootUser: vi.fn(),
  findActiveByOwner: vi.fn(),
  resolveTenantForOwner: vi.fn(),
  create: vi.fn(),
  hasRoomForTeamMembers: vi.fn(),
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  ROOT_TENANT_ID: "1",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  userRepository: { findIdByEmail: mocks.findIdByEmail },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/user/provision-root-user", () => ({
  findOrProvisionRootUser: mocks.findOrProvisionRootUser,
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {
    findActiveByOwner: mocks.findActiveByOwner,
    resolveTenantForOwner: mocks.resolveTenantForOwner,
    create: mocks.create,
  },
}))

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    hasRoomForTeamMembers: mocks.hasRoomForTeamMembers,
  },
}))

const { adminWorkspaceService } = await import("../src/admin-workspace/service")

const PERMISSIONS = {
  superAdmin: true,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
} as const

function createInput(
  overrides?: Partial<
    Parameters<typeof adminWorkspaceService.createWithMembers>[0]
  >,
) {
  return {
    actorId: "admin-1",
    name: "New Workspace",
    ownerEmail: "Owner@Example.com ",
    memberEmails: [],
    permissions: PERMISSIONS,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.findIdByEmail.mockReset()
  mocks.findOrProvisionRootUser.mockReset().mockResolvedValue({
    userId: "owner-1",
    created: true,
  })
  mocks.findActiveByOwner.mockReset().mockResolvedValue(undefined)
  mocks.resolveTenantForOwner.mockReset().mockResolvedValue("1")
  mocks.create.mockReset().mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  mocks.hasRoomForTeamMembers.mockReset().mockResolvedValue(true)
  mocks.dispatchAuditRecord.mockReset()
})

describe("adminWorkspaceService.createWithMembers — email normalization", () => {
  test("trims and lowercases the owner email, and dedupes + strips the owner from the member list", async () => {
    mocks.findOrProvisionRootUser.mockImplementation(
      async (email: string) =>
        ({
          "owner@example.com": { userId: "owner-1", created: false },
          "member@example.com": { userId: "member-1", created: false },
        })[email] ?? { userId: "unknown", created: false },
    )

    await adminWorkspaceService.createWithMembers(
      createInput({
        memberEmails: [
          "Owner@Example.com",
          " Member@Example.com ",
          "member@example.com",
        ],
      }),
    )

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [{ userId: "member-1", permissions: PERMISSIONS }],
      }),
    )
  })
})

describe("adminWorkspaceService.createWithMembers — owner/member provisioning", () => {
  test("does not provision an email that already resolves to a user", async () => {
    mocks.findOrProvisionRootUser.mockResolvedValue({
      userId: "owner-1",
      created: false,
    })

    const result = await adminWorkspaceService.createWithMembers(createInput())

    expect(result.owner).toEqual({
      email: "owner@example.com",
      userId: "owner-1",
      created: false,
    })
  })

  test("provisions a fresh user for an email with no existing account", async () => {
    mocks.findOrProvisionRootUser.mockResolvedValue({
      userId: "owner-1",
      created: true,
    })

    const result = await adminWorkspaceService.createWithMembers(createInput())

    expect(result.owner).toEqual({
      email: "owner@example.com",
      userId: "owner-1",
      created: true,
    })
  })
})

describe("adminWorkspaceService.createWithMembers — owner already has a workspace", () => {
  test("throws ownerAlreadyHasWorkspace (409) without creating anything", async () => {
    mocks.findActiveByOwner.mockResolvedValue({ id: "ws-existing" })

    await expect(
      adminWorkspaceService.createWithMembers(createInput()),
    ).rejects.toMatchObject({
      code: "ownerAlreadyHasWorkspace",
      httpStatusCode: 409,
    })

    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe("adminWorkspaceService.createWithMembers — non-root tenant members", () => {
  test("throws memberNotFound for an email that doesn't resolve in a reseller tenant, and never auto-provisions it", async () => {
    mocks.resolveTenantForOwner.mockResolvedValue("tenant-2")
    mocks.findIdByEmail.mockResolvedValue(undefined)

    await expect(
      adminWorkspaceService.createWithMembers(
        createInput({ memberEmails: ["member@example.com"] }),
      ),
    ).rejects.toMatchObject({ code: "memberNotFound" })

    expect(mocks.findIdByEmail).toHaveBeenCalledWith({
      email: "member@example.com",
      tenantId: "tenant-2",
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("resolves an existing member by email in the owner's reseller tenant without provisioning", async () => {
    mocks.resolveTenantForOwner.mockResolvedValue("tenant-2")
    mocks.findIdByEmail.mockResolvedValue({ id: "member-1" })

    await adminWorkspaceService.createWithMembers(
      createInput({ memberEmails: ["member@example.com"] }),
    )

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        members: [{ userId: "member-1", permissions: PERMISSIONS }],
      }),
    )
  })
})

describe("adminWorkspaceService.createWithMembers — team-member quota", () => {
  test("throws teamMembersLimit before creating anything when there's no room for the owner plus every member", async () => {
    mocks.hasRoomForTeamMembers.mockResolvedValue(false)

    await expect(
      adminWorkspaceService.createWithMembers(
        createInput({ memberEmails: ["member@example.com"] }),
      ),
    ).rejects.toMatchObject({ code: "teamMembersLimit" })

    expect(mocks.hasRoomForTeamMembers).toHaveBeenCalledWith({
      userId: "owner-1",
      additionalCount: 2,
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
