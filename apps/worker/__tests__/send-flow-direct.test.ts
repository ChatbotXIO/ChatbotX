import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByContactId: vi.fn(),
  findBy: vi.fn(),
  findOrCreate: vi.fn(),
  resolveOutreachConversation: vi.fn(),
  runFlowNode: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { listByContactId: mocks.listByContactId },
  conversationService: {
    findBy: mocks.findBy,
    findOrCreate: mocks.findOrCreate,
    resolveOutreachConversation: mocks.resolveOutreachConversation,
  },
}))
vi.mock("../src/integration/handlers/flow", () => ({
  runFlowNode: mocks.runFlowNode,
}))

const { sendFlowDirect } = await import(
  "../src/integration/handlers/send-flow-direct"
)

const params = { contactId: "c1", flowId: "f1", workspaceId: "w1" }

describe("sendFlowDirect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runFlowNode.mockResolvedValue(undefined)
  })

  test("a non-SMTP contact without a conversation throws and creates nothing", async () => {
    mocks.listByContactId.mockResolvedValue([
      { id: "ci1", channel: "messenger" },
    ])
    mocks.findBy.mockResolvedValue(null)

    await expect(sendFlowDirect(params)).rejects.toThrow(
      "Conversation not found for contact c1",
    )
    expect(mocks.findOrCreate).not.toHaveBeenCalled()
    expect(mocks.resolveOutreachConversation).not.toHaveBeenCalled()
    expect(mocks.runFlowNode).not.toHaveBeenCalled()
  })

  test("a non-SMTP contact runs the flow on its existing conversation", async () => {
    const conversation = { id: "conv-1" }
    mocks.listByContactId.mockResolvedValue([
      { id: "ci1", channel: "messenger" },
    ])
    mocks.findBy.mockResolvedValue(conversation)

    await sendFlowDirect(params)

    expect(mocks.resolveOutreachConversation).not.toHaveBeenCalled()
    expect(mocks.runFlowNode).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: conversation }),
      expect.anything(),
    )
  })

  test("an SMTP-only contact opens an email thread without a prior conversation", async () => {
    const thread = { id: "thread-1" }
    mocks.listByContactId.mockResolvedValue([{ id: "ci1", channel: "smtp" }])
    mocks.resolveOutreachConversation.mockResolvedValue(thread)

    await sendFlowDirect({ ...params, flowExecutionKey: "k" })

    expect(mocks.findBy).not.toHaveBeenCalled()
    expect(mocks.resolveOutreachConversation).toHaveBeenCalledWith(
      expect.objectContaining({ seed: "k:f1:ci1" }),
    )
    expect(mocks.runFlowNode).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: thread }),
      expect.anything(),
    )
  })

  test("a mixed contact sends each inbox through its own branch", async () => {
    const dm = { id: "dm" }
    const thread = { id: "thread" }
    mocks.listByContactId.mockResolvedValue([
      { id: "ci1", channel: "messenger" },
      { id: "ci2", channel: "smtp" },
    ])
    mocks.findBy.mockResolvedValue(dm)
    mocks.resolveOutreachConversation.mockResolvedValue(thread)

    await sendFlowDirect(params)

    expect(mocks.resolveOutreachConversation).toHaveBeenCalledTimes(1)
    const used = mocks.runFlowNode.mock.calls.map(([arg]) => [
      arg.contactInboxId.id,
      arg.conversationId.id,
    ])
    expect(used).toEqual(
      expect.arrayContaining([
        ["ci1", "dm"],
        ["ci2", "thread"],
      ]),
    )
  })
})
