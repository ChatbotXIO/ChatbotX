import { beforeEach, describe, expect, test, vi } from "vitest"

const insertBuilder = {
  values: vi.fn(() => insertBuilder),
  returning: vi.fn(async () => [
    { id: "invitation-1", workspaceId: "ws-1", code: "code-1" },
  ]),
}
const db = { insert: vi.fn(() => insertBuilder) }
vi.mock("@chatbotx.io/database/client", () => ({ db }))

vi.mock("@chatbotx.io/database/schema", () => ({ invitationModel: {} }))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
  SymbolicSnowflakeIDs: { generate: vi.fn(() => "generated-code") },
}))

vi.mock("../src/workspace-member/permissions", () => ({
  normalizeWorkspaceMemberPermissions: (permissions: unknown) => permissions,
}))

const findById = vi.fn(async () => ({ id: "ws-1", ownerId: "owner-1" }))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { findById: (...args: unknown[]) => findById(...args) },
}))

const hasReachedLimit = vi.fn(async () => false)
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    hasReachedLimit: (...args: unknown[]) => hasReachedLimit(...args),
  },
}))

const dispatchAuditRecord = vi.fn(async () => undefined)
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const loggerWarn = vi.fn()
vi.mock("../src/logger", () => ({ logger: { warn: loggerWarn } }))

const { invitationService } = await import("../src/invitation/service")

const basePermissions = {
  superAdmin: false,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: false,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  insertBuilder.values.mockReturnValue(insertBuilder)
  insertBuilder.returning.mockResolvedValue([
    { id: "invitation-1", workspaceId: "ws-1", code: "code-1" },
  ])
  findById.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  hasReachedLimit.mockResolvedValue(false)
})

describe("invitationService.create", () => {
  test("throws and never inserts once the owner's team-member limit is reached", async () => {
    hasReachedLimit.mockResolvedValue(true)

    await expect(
      invitationService.create({
        workspaceId: "ws-1",
        permissions: basePermissions,
        invitedBy: "user-1",
      }),
    ).rejects.toThrow("Team member limit reached for this workspace plan")

    expect(db.insert).not.toHaveBeenCalled()
  })

  test("inserts the invitation and records an 'invite' audit when not inside a caller transaction", async () => {
    const invitation = await invitationService.create({
      workspaceId: "ws-1",
      permissions: { ...basePermissions, superAdmin: true },
      invitedBy: "user-1",
    })

    expect(invitation).toEqual({
      id: "invitation-1",
      workspaceId: "ws-1",
      code: "code-1",
    })
    expect(dispatchAuditRecord).toHaveBeenCalledWith({
      action: "invite",
      detail: "invited a new admin",
    })
  })

  test("skips the audit call entirely when composed inside a caller-owned transaction", async () => {
    const tx = { insert: vi.fn(() => insertBuilder) }

    await invitationService.create({
      workspaceId: "ws-1",
      permissions: basePermissions,
      invitedBy: "user-1",
      tx: tx as never,
    })

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("a failing audit write is logged and swallowed — the invitation is still returned", async () => {
    dispatchAuditRecord.mockRejectedValueOnce(new Error("audit backend down"))

    const invitation = await invitationService.create({
      workspaceId: "ws-1",
      permissions: basePermissions,
      invitedBy: "user-1",
    })

    expect(invitation).toEqual({
      id: "invitation-1",
      workspaceId: "ws-1",
      code: "code-1",
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        invitationId: "invitation-1",
      }),
      "Failed to record audit log for workspace invitation",
    )
  })
})
