// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const buildInboundCartReply = vi.fn()
const chatQueueAdd = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  webshopService: { buildInboundCartReply },
  withBlockedOwnerGuard: async (_workspaceId: string, fn: () => unknown) =>
    await fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: { sendFlowMessage: "sendFlowMessage" },
  chatQueue: { add: (...args: unknown[]) => chatQueueAdd(...args) },
}))

const { replyToInboundCart } = await import(
  "../src/integration/handlers/reply-to-inbound-cart"
)

const data = {
  workspaceId: "ws-1",
  conversationId: "conv-1",
  contactId: "c-1",
  contactInboxId: "ci-1",
  messageId: "m-1",
  cart: { note: null, items: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("replyToInboundCart", () => {
  test("answers with the summary and a CHECK OUT link button", async () => {
    buildInboundCartReply.mockResolvedValue({
      text: "Number of items: 2",
      buttonLabel: "CHECK OUT",
      buttonUrl: "https://app/shop/ws-1/cart?token={{shop_token}}",
    })

    await replyToInboundCart(data)

    expect(buildInboundCartReply).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      contactInboxId: "ci-1",
      cart: data.cart,
    })
    const [name, job, options] = chatQueueAdd.mock.calls[0] as [
      string,
      {
        data: {
          conversationId: string
          flowId: string
          step: {
            stepType: string
            text: string
            buttons: Array<{
              label: string
              buttonType: string
              beforeStep: { url: string }
            }>
          }
        }
      },
      { jobId: string },
    ]
    expect(name).toBe("sendFlowMessage")
    expect(job.data).toMatchObject({
      conversationId: "conv-1",
      flowId: "",
      step: { stepType: "sendText", text: "Number of items: 2" },
    })
    expect(job.data.step.buttons).toEqual([
      expect.objectContaining({
        label: "CHECK OUT",
        buttonType: "openWebsite",
        beforeStep: expect.objectContaining({
          url: "https://app/shop/ws-1/cart?token={{shop_token}}",
        }),
      }),
    ])
    // One answer per cart message, however often the webhook is redelivered.
    expect(options.jobId).toBe("inbound-cart-checkout-m-1")
    expect(options.jobId).not.toContain(":")
  })

  test("sends nothing when the store has nothing to answer", async () => {
    buildInboundCartReply.mockResolvedValue(null)
    await replyToInboundCart(data)
    expect(chatQueueAdd).not.toHaveBeenCalled()
  })
})
