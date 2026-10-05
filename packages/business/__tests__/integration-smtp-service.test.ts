// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockDisconnect,
  mockDispatchAuditRecord,
  mockFindOrFail,
  mockInboxCreate,
  mockTransaction,
  mockUpdate,
  mockUpdateReturning,
  mockUpdateWhere,
  mockUpsertConnectionRow,
  mockWithQuotaCompensation,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockUpdateReturning = vi.fn(async () => [
    { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
  ])
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockDispatchAuditRecord: vi.fn(async () => undefined),
    mockFindOrFail: vi.fn(),
    mockInboxCreate: vi.fn(async () => ({
      inbox: { id: "smtp-1" },
      wasCreated: true,
    })),
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, update: mockUpdate }),
    ),
    mockUpdate,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpsertConnectionRow: vi.fn(async () => ({ id: "conn-1" })),
    mockWithQuotaCompensation: vi.fn(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    ),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    delete: mockDelete,
    transaction: mockTransaction,
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { smtp: "smtp" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationSmtpModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "smtp-1",
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { smtp: { duplicateConstraint: undefined } },
  upsertConnectionRow: mockUpsertConnectionRow,
  withQuotaCompensation: mockWithQuotaCompensation,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { create: mockInboxCreate, disconnect: mockDisconnect },
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { disconnectInbox: mockDisconnect },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { integrationSmtpService } = await import(
  "../src/integration-smtp/service"
)

const auth = {
  authType: "custom" as const,
  provider: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  username: "user",
  password: "pass",
}

describe("integrationSmtpService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithQuotaCompensation.mockImplementation(
      async (_input: unknown, operation: () => Promise<unknown>) =>
        await operation(),
    )
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({ delete: mockDelete, update: mockUpdate }),
    )
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "smtp-1" },
      wasCreated: true,
    })
    mockUpsertConnectionRow.mockResolvedValue({ id: "conn-1" })
  })

  test("passes auth through untouched and fromAddress as extraConfig", async () => {
    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockUpsertConnectionRow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "smtp",
        auth,
        extraConfig: { fromAddress: "from@example.com" },
        inboxId: "smtp-1",
        ownerId: "owner-1",
      }),
    )
  })

  // The audit record belongs to the service, not the calling action, so a
  // public-API or worker caller gets it too.
  test("records the connect audit when the channel was created", async () => {
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: true,
    })

    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "connect",
      detail: "connected a new SMTP channel (#inbox-1)",
    })
  })

  test("records no audit when an existing inbox was reused", async () => {
    mockInboxCreate.mockResolvedValue({
      inbox: { id: "inbox-1" },
      wasCreated: false,
    })

    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("integrationSmtpService.update", () => {
  const existing = {
    id: "smtp-1",
    workspaceId: "ws-1",
    inboxId: "inbox-1",
    name: "user",
    fromAddress: "from@example.com",
    auth,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindOrFail.mockResolvedValue(existing)
    mockUpdateReturning.mockResolvedValue([
      { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
    ])
  })

  test("returns the updated row", async () => {
    const result = await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { username: "updated", fromAddress: "a@b.com" },
    })

    expect(result).toEqual({
      id: "smtp-1",
      name: "updated",
      fromAddress: "a@b.com",
    })
  })

  // The action layer pre-checks ownership via `findByIdForWorkspace`, but the
  // method takes a `workspaceId` and must scope on it itself — otherwise a
  // future caller that trusts the parameter writes across workspaces.
  test("scopes the update by workspaceId as well as id", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { username: "updated", fromAddress: "a@b.com" },
    })

    expect(mockUpdateWhere).toHaveBeenCalledWith({
      conditions: [
        { field: "id", value: "smtp-1" },
        { field: "workspaceId", value: "ws-1" },
      ],
    })
  })

  // Every omitted field falls back to the stored auth, so a partial form
  // submission never blanks out a credential.
  test("merges omitted fields from the stored auth", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { fromAddress: "a@b.com" },
    })

    expect(mockUpdateWhere).toHaveBeenCalled()
    const setArg = (
      mockUpdate.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> }
    ).set
    expect(setArg).toHaveBeenCalledWith({
      auth,
      name: existing.name,
      fromAddress: "a@b.com",
    })
  })

  test("records the update audit when the payload actually changed", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: { fromAddress: "changed@example.com" },
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "updated the SMTP channel configuration",
    })
  })

  // Re-submitting the form untouched must not spam the audit trail.
  test("records no audit when the resolved payload is unchanged", async () => {
    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      data: {
        provider: auth.provider,
        host: auth.host,
        port: auth.port,
        username: existing.name,
        password: auth.password,
        fromAddress: existing.fromAddress,
      },
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})

describe("integrationSmtpService.disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("deletes then calls inboxService.disconnect", async () => {
    const callOrder: string[] = []
    const tx = {
      delete: vi.fn(() => {
        callOrder.push("delete")
        return { where: vi.fn(async () => undefined) }
      }),
    }
    mockDisconnect.mockImplementation(() => {
      callOrder.push("inbox-disconnect")
      return Promise.resolve()
    })

    await integrationSmtpService.disconnect({
      workspaceId: "ws-1",
      id: "smtp-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
      tx: tx as never,
    })

    expect(callOrder).toEqual(["delete", "inbox-disconnect"])
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "disconnect",
      detail: "disconnected the SMTP channel (#smtp-1)",
    })
  })
})
