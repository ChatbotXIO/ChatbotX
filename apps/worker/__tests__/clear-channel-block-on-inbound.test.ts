import { beforeEach, describe, expect, test, vi } from "vitest"

const { setChannelBlocked } = vi.hoisted(() => ({
  setChannelBlocked: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/business/contact-inbox", () => ({
  contactInboxService: { setChannelBlocked },
}))

import { clearChannelBlockOnInbound } from "../src/integration/handlers/clear-channel-block-on-inbound"

const blockedLineInbox = {
  inboxId: "inbox-1",
  sourceId: "U1",
  channel: "line",
  channelBlockedAt: new Date("2026-01-01T00:00:00Z"),
}
const incoming = { messageType: "incoming" as const }
const at = new Date("2026-01-02T00:00:00Z")

describe("clearChannelBlockOnInbound", () => {
  beforeEach(() => {
    setChannelBlocked.mockReset().mockResolvedValue(undefined)
  })

  test("an incoming message clears a recorded LINE block at the event time", async () => {
    await clearChannelBlockOnInbound({
      workspaceId: "ws-1",
      contactInbox: blockedLineInbox,
      message: incoming,
      occurredAt: at,
    })

    expect(setChannelBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-1",
      sourceId: "U1",
      blocked: false,
      occurredAt: at,
    })
  })

  test("falls back to the processing time without an event time", async () => {
    vi.useFakeTimers({ now: at })
    try {
      await clearChannelBlockOnInbound({
        workspaceId: "ws-1",
        contactInbox: blockedLineInbox,
        message: incoming,
        occurredAt: null,
      })
    } finally {
      vi.useRealTimers()
    }

    expect(setChannelBlocked.mock.calls[0]?.[0].occurredAt).toEqual(at)
  })

  test.each([
    [
      "the contact is not blocked",
      { contactInbox: { ...blockedLineInbox, channelBlockedAt: null } },
    ],
    [
      "the message is an outgoing echo",
      { message: { messageType: "outgoing" } },
    ],
    ["there is no message", { message: null }],
    [
      "the channel does not track blocks",
      { contactInbox: { ...blockedLineInbox, channel: "messenger" } },
    ],
  ])("does nothing when %s", async (_label, override) => {
    await clearChannelBlockOnInbound({
      workspaceId: "ws-1",
      contactInbox: blockedLineInbox,
      message: incoming,
      occurredAt: at,
      ...(override as object),
    } as never)

    expect(setChannelBlocked).not.toHaveBeenCalled()
  })

  test("a failure is swallowed so the message is still ingested", async () => {
    setChannelBlocked.mockRejectedValueOnce(new Error("db down"))

    await expect(
      clearChannelBlockOnInbound({
        workspaceId: "ws-1",
        contactInbox: blockedLineInbox,
        message: incoming,
        occurredAt: at,
      }),
    ).resolves.toBeUndefined()
  })
})
