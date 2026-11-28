import { beforeEach, describe, expect, it, vi } from "vitest"

const createOutgoing = vi.fn()
const assertManualSendWindowOpen = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messageService: {
    assertManualSendWindowOpen: (...args: unknown[]) =>
      assertManualSendWindowOpen(...args),
    createOutgoing: (...args: unknown[]) => createOutgoing(...args),
  },
}))

const { sendOutgoing } = await import(
  "../src/features/translation/lib/send-outgoing"
)

const send = () =>
  sendOutgoing({
    workspaceId: "w1",
    conversation: { sourceId: null } as never,
    contactInbox: { channel: "whatsapp" } as never,
    input: { text: "hi" } as never,
    sendFrom: "inbox",
  })

describe("sendOutgoing messaging window gate", () => {
  beforeEach(() => {
    createOutgoing.mockReset().mockResolvedValue({ id: "m1" })
    assertManualSendWindowOpen.mockReset().mockResolvedValue(undefined)
  })

  it("runs the business gate before queueing", async () => {
    await send()
    expect(assertManualSendWindowOpen).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", sendFrom: "inbox" }),
    )
    expect(createOutgoing).toHaveBeenCalledOnce()
  })

  it("queues nothing when the gate refuses", async () => {
    assertManualSendWindowOpen.mockRejectedValue(
      Object.assign(new Error("closed"), { code: "messagingWindowClosed" }),
    )
    await expect(send()).rejects.toMatchObject({
      code: "messagingWindowClosed",
    })
    expect(createOutgoing).not.toHaveBeenCalled()
  })
})
