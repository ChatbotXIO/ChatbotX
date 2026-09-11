// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectChannelIntegration,
  mockDelete,
  mockDisconnect,
  mockInsert,
  mockInsertValues,
  mockTransaction,
  mockUpdate,
  mockUpdateReturning,
  mockUpdateWhere,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(async () => undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertValues = vi.fn(async () => undefined)
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockUpdateReturning = vi.fn(async () => [
    { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
  ])
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockConnectChannelIntegration: vi.fn(),
    mockDelete,
    mockDisconnect: vi.fn(async () => undefined),
    mockInsert,
    mockInsertValues,
    mockTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ delete: mockDelete, insert: mockInsert, update: mockUpdate }),
    ),
    mockUpdate,
    mockUpdateReturning,
    mockUpdateWhere,
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
  findOrFail: vi.fn(),
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

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mockConnectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mockDisconnect },
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
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          delete: mockDelete,
          insert: mockInsert,
          update: mockUpdate,
        }),
    )
  })

  test("passes the pre-resolved host/port straight through into auth", async () => {
    mockConnectChannelIntegration.mockImplementation(
      async (props: {
        insertIntegration: (inboxId: string) => Promise<unknown>
      }) => {
        await props.insertIntegration("inbox-1")
        return { inbox: { id: "inbox-1" }, wasCreated: true }
      },
    )

    await integrationSmtpService.connect({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      name: "user1",
      fromAddress: "from@example.com",
      auth,
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        auth,
        fromAddress: "from@example.com",
      }),
    )
  })
})

describe("integrationSmtpService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the updated row", async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
    ])

    const result = await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      auth,
      name: "updated",
      fromAddress: "a@b.com",
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
    mockUpdateReturning.mockResolvedValue([
      { id: "smtp-1", name: "updated", fromAddress: "a@b.com" },
    ])

    await integrationSmtpService.update({
      workspaceId: "ws-1",
      id: "smtp-1",
      auth,
      name: "updated",
      fromAddress: "a@b.com",
    })

    expect(mockUpdateWhere).toHaveBeenCalledWith({
      conditions: [
        { field: "id", value: "smtp-1" },
        { field: "workspaceId", value: "ws-1" },
      ],
    })
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
  })
})
