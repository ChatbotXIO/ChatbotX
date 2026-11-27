import { beforeEach, describe, expect, it, vi } from "vitest"

const createOutgoing = vi.fn()
const findActiveById = vi.fn()
const findByIdForWorkspace = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  flowService: {
    findActiveById: (...args: unknown[]) => findActiveById(...args),
  },
  flowVersionService: {
    findByIdForWorkspace: (...args: unknown[]) => findByIdForWorkspace(...args),
  },
  messageService: {
    createOutgoing: (...args: unknown[]) => createOutgoing(...args),
  },
}))

const { sendOutgoing } = await import(
  "../src/features/translation/lib/send-outgoing"
)

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms)

const send = (
  channel: string,
  lastIncomingMs: number | null,
  opts: { sendFrom?: "inbox" | "api" | "flow"; sourceId?: string | null } = {},
) =>
  sendOutgoing({
    workspaceId: "w1",
    conversation: { sourceId: opts.sourceId ?? null } as never,
    contactInbox: {
      channel,
      lastIncomingMessageAt:
        lastIncomingMs === null ? null : ago(lastIncomingMs),
    } as never,
    input: { text: "hi" } as never,
    sendFrom: (opts.sendFrom ?? "api") as never,
  })

describe("sendOutgoing messaging window", () => {
  beforeEach(() => {
    createOutgoing.mockReset().mockResolvedValue({ id: "m1" })
    findActiveById.mockReset()
    findByIdForWorkspace.mockReset()
  })

  it.each([
    ["whatsapp", 25 * HOUR],
    ["tiktok", 49 * HOUR],
    ["messenger", 8 * 24 * HOUR],
    ["instagram", 8 * 24 * HOUR],
  ])("rejects a manual %s send when closed", async (channel, ms) => {
    await expect(send(channel, ms)).rejects.toMatchObject({
      code: "messagingWindowClosed",
      httpStatusCode: 409,
    })
    expect(createOutgoing).not.toHaveBeenCalled()
  })

  it.each([
    ["whatsapp", 23 * HOUR],
    ["tiktok", 30 * HOUR],
    ["messenger", 3 * 24 * HOUR],
    ["whatsapp", null],
    ["telegram", 100 * 24 * HOUR],
  ])("lets a %s send through (open/humanAgent/unknown/unlimited)", async (channel, ms) => {
    await send(channel, ms)
    expect(createOutgoing).toHaveBeenCalledOnce()
  })

  it("does not apply to comment conversations", async () => {
    await send("messenger", 30 * 24 * HOUR, { sourceId: "comment:1" })
    expect(createOutgoing).toHaveBeenCalledOnce()
  })

  it("allows a closed-window template-first flow", async () => {
    findActiveById.mockResolvedValue({ currentVersionId: "v1" })
    findByIdForWorkspace.mockResolvedValue({
      nodes: [
        {
          id: "start",
          data: {
            isStartNode: true,
            details: { steps: [{ stepType: "sendWaTemplateMessage" }] },
          },
        },
      ],
    })

    await sendOutgoing({
      workspaceId: "w1",
      conversation: { sourceId: null } as never,
      contactInbox: {
        channel: "whatsapp",
        lastIncomingMessageAt: ago(25 * HOUR),
      } as never,
      input: { flowId: "f1" } as never,
      sendFrom: "inbox",
    })

    expect(createOutgoing).toHaveBeenCalledOnce()
  })
})
