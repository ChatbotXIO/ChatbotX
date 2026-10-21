// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildProductSearchReply: vi.fn(),
  chatQueueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildProductSearchReply: mocks.buildProductSearchReply,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendFlowMessage: "sendFlowMessage" },
  chatQueue: { add: mocks.chatQueueAdd },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { replyWithMatchingProducts } = await import(
  "../src/integration/handlers/automated-response/product-search"
)

const input = {
  conversation: { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" },
  contactInbox: { id: "ci-1", channel: "messenger" },
  messageId: "m-1",
  text: "áo thun",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("replyWithMatchingProducts", () => {
  test("sends the products a message names and stops the usual reply", async () => {
    const step = { id: "s-1", stepType: "sendCollection" }
    mocks.buildProductSearchReply.mockResolvedValue(step)
    await expect(replyWithMatchingProducts(input)).resolves.toBe(true)
    expect(mocks.buildProductSearchReply).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      channel: "messenger",
      text: "áo thun",
    })
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "sendFlowMessage",
      {
        type: "sendFlowMessage",
        data: {
          conversationId: "conv-1",
          contactInboxId: "ci-1",
          flowId: "",
          step,
        },
      },
      { jobId: "product-search-m-1" },
    )
  })

  test("lets the usual reply run when nothing matches", async () => {
    mocks.buildProductSearchReply.mockResolvedValue(null)
    await expect(replyWithMatchingProducts(input)).resolves.toBe(false)
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("a failed search falls through to the usual reply", async () => {
    mocks.buildProductSearchReply.mockRejectedValue(new Error("db down"))
    await expect(replyWithMatchingProducts(input)).resolves.toBe(false)
  })
})
