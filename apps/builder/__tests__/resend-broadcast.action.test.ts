// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindOrFail,
  mockDbTransaction,
  mockTxInsert,
  mockTxInsertValues,
  mockTxInsertReturning,
  mockCreateId,
  MockChatbotXException,
} = vi.hoisted(() => {
  const mockTxInsertReturning = vi.fn()
  const mockTxInsertValues = vi.fn()
  mockTxInsertValues.mockReturnValue({ returning: mockTxInsertReturning })
  const mockTxInsert = vi.fn()
  mockTxInsert.mockReturnValue({ values: mockTxInsertValues })

  class MockChatbotXException extends Error {
    constructor(message: string) {
      super(message)
      this.name = "ChatbotXException"
    }
  }

  return {
    mockFindOrFail: vi.fn(),
    mockDbTransaction: vi.fn(),
    mockTxInsert,
    mockTxInsertValues,
    mockTxInsertReturning,
    mockCreateId: vi.fn().mockReturnValue("new-bc-id"),
    MockChatbotXException,
  }
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: MockChatbotXException,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn().mockResolvedValue({
    targetWorkspaceMember: { permissions: ["emailAndPhone"] },
  }),
}))

vi.mock("@chatbotx.io/database/queries/contact-filter/permission", () => ({
  pruneEmailPhoneFilterConditions: (contactFilter: unknown) =>
    contactFilter ?? undefined,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: mockDbTransaction,
  },
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { _: "broadcastModel" },
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    createId: mockCreateId,
  }
})

const { resendBroadcast } = await import(
  "../src/features/broadcasts/actions/resend-broadcast.action"
)

const WORKSPACE_ID = "ws-1"
const BROADCAST_ID = "bc-1"

const baseBroadcast = {
  id: BROADCAST_ID,
  workspaceId: WORKSPACE_ID,
  name: "Summer Sale",
  status: "sent" as const,
  channel: "whatsapp" as const,
  flowId: "flow-1",
  integrationWhatsappId: "wa-1",
  integrationMessengerId: "msg-1",
  subaction: "whatsappWithin24Hours" as const,
  templateId: null,
  templateData: null,
  schedulesType: "now" as const,
  contactFilter: null,
}

describe("resendBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTxInsertValues.mockReturnValue({ returning: mockTxInsertReturning })
    mockTxInsert.mockReturnValue({ values: mockTxInsertValues })
    mockTxInsertReturning.mockResolvedValue([{ id: "new-bc-id" }])
    mockDbTransaction.mockImplementation(
      async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<unknown>) =>
        fn({ insert: mockTxInsert }),
    )
    mockCreateId.mockReturnValue("new-bc-id")
  })

  test("throws ChatbotXException when broadcast status is not 'sent'", async () => {
    const draftBroadcast = { ...baseBroadcast, status: "scheduled" as const }
    mockFindOrFail.mockResolvedValue(draftBroadcast)

    await expect(
      resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID }),
    ).rejects.toThrow("Broadcast is not sent")
  })

  test("throws ChatbotXException (not a generic Error) for non-sent status", async () => {
    const draftBroadcast = { ...baseBroadcast, status: "failed" as const }
    mockFindOrFail.mockResolvedValue(draftBroadcast)

    await expect(
      resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID }),
    ).rejects.toBeInstanceOf(MockChatbotXException)
  })

  test("propagates error when findOrFail throws (broadcast not found)", async () => {
    mockFindOrFail.mockRejectedValue(new Error("Record not found"))

    await expect(
      resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID }),
    ).rejects.toThrow("Record not found")
  })

  test("inserts new broadcast with '(Resend)' suffix in name via transaction", async () => {
    mockFindOrFail.mockResolvedValue(baseBroadcast)

    await resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID })

    expect(mockDbTransaction).toHaveBeenCalledOnce()
    const insertedValues = mockTxInsertValues.mock.calls[0]?.[0] as {
      name: string
      status: string
    }
    expect(insertedValues.name).toBe("Summer Sale (Resend)")
    expect(insertedValues.status).toBe("scheduled")
  })

  test("new broadcast copies key fields from original", async () => {
    mockFindOrFail.mockResolvedValue(baseBroadcast)

    await resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID })

    const insertedValues = mockTxInsertValues.mock.calls[0]?.[0] as {
      workspaceId: string
      flowId: string
      channel: string
      schedulesType: string
      integrationWhatsappId: string
      integrationMessengerId: string
    }
    expect(insertedValues.workspaceId).toBe(WORKSPACE_ID)
    expect(insertedValues.flowId).toBe("flow-1")
    expect(insertedValues.channel).toBe("whatsapp")
    expect(insertedValues.schedulesType).toBe("now")
    expect(insertedValues.integrationWhatsappId).toBe("wa-1")
    expect(insertedValues.integrationMessengerId).toBe("msg-1")
  })

  test("new broadcast uses a new id from createId", async () => {
    mockFindOrFail.mockResolvedValue(baseBroadcast)
    mockCreateId.mockReturnValue("generated-id-42")

    await resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID })

    const insertedValues = mockTxInsertValues.mock.calls[0]?.[0] as {
      id: string
    }
    expect(insertedValues.id).toBe("generated-id-42")
  })

  test("returns the new broadcast copy", async () => {
    const newBroadcast = { id: "new-bc-id", name: "Summer Sale (Resend)" }
    mockFindOrFail.mockResolvedValue(baseBroadcast)
    mockTxInsertReturning.mockResolvedValue([newBroadcast])

    const result = await resendBroadcast({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
    })

    expect(result).toBe(newBroadcast)
  })

  test("scopes findOrFail by workspaceId", async () => {
    mockFindOrFail.mockResolvedValue(baseBroadcast)

    await resendBroadcast({ workspaceId: "other-ws", id: BROADCAST_ID })

    const findArgs = mockFindOrFail.mock.calls[0]?.[0] as {
      where: { workspaceId: string }
    }
    expect(findArgs.where.workspaceId).toBe("other-ws")
  })
})
