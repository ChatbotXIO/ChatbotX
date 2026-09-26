import type * as PartysocketConfig from "@chatbotx.io/partysocket-config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  broadcastToWorkspaceParty,
  flushAllPendingWorkspaceBroadcasts,
  flushPendingWorkspaceBroadcasts,
  publishToWorkspaceParty,
  resetRealtimeBroadcastStateForTests,
  WORKSPACE_BROADCAST_MAX_BYTES,
  WORKSPACE_BROADCAST_MAX_EVENTS,
} from "../src/platform/realtime-broadcast"

const {
  broadcastToWorkspacePartyLow,
  loggerError,
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveRealtimeDeliveryGate,
  resolveTenantSettings,
} = vi.hoisted(() => ({
  broadcastToWorkspacePartyLow: vi.fn(),
  loggerError: vi.fn(),
  resolveBroadcastSecret: vi.fn(),
  resolveRealtimeBroadcastUrl: vi.fn(),
  resolveRealtimeDeliveryGate: vi.fn(),
  resolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/partysocket-config", async () => {
  const actual = await vi.importActual<typeof PartysocketConfig>(
    "@chatbotx.io/partysocket-config",
  )
  return { ...actual, broadcastToWorkspaceParty: broadcastToWorkspacePartyLow }
})

vi.mock("../src/platform/settings", () => ({
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveRealtimeDeliveryGate,
  resolveTenantSettings,
}))

vi.mock("../src/logger", () => ({
  logger: { error: loggerError },
}))
const typingEvent = {
  eventType: "typing",
  data: { conversationId: "conversation_1", seconds: 1, typing: true },
} as const

const messageCreatedEvent = {
  eventType: "messageCreated",
  data: { conversationId: "conversation_1" },
} as const

const contactBlockedEvent = {
  eventType: "contactBlocked",
  data: { contactId: "contact_1" },
} as const

/** Mixed chat+voip topic — must never be suppressed or drive the gate. */
const conversationAssignedEvent = {
  eventType: "conversationAssigned",
  data: {
    conversationIds: ["conversation_1"],
    assignedUserId: "user_1",
    assignedInboxTeamId: null,
  },
} as const

/** Voip-only topic — must never be suppressed or drive the gate. */
const voipEvent = {
  eventType: "whatsappCallClaimedElsewhere",
  data: {
    whatsappCallId: "call_1",
    wacid: "wacid_1",
    answeredByUserId: "user_1",
  },
} as const

beforeEach(() => {
  vi.useFakeTimers()
  broadcastToWorkspacePartyLow.mockReset()
  resolveBroadcastSecret.mockReset()
  resolveRealtimeBroadcastUrl.mockReset()
  resolveRealtimeDeliveryGate.mockReset()
  resolveTenantSettings.mockReset()
  loggerError.mockReset()
  broadcastToWorkspacePartyLow.mockResolvedValue(1)
  resolveBroadcastSecret.mockReturnValue("s".repeat(32))
  resolveRealtimeBroadcastUrl.mockReturnValue("http://realtime:1999")
  resolveRealtimeDeliveryGate.mockReturnValue(true)
  resetRealtimeBroadcastStateForTests()
})

afterEach(() => {
  resetRealtimeBroadcastStateForTests()
  vi.useRealTimers()
})

const broadcastAndFlush = async (
  ...args: Parameters<typeof broadcastToWorkspaceParty>
) => {
  const broadcast = broadcastToWorkspaceParty(...args)
  await vi.runOnlyPendingTimersAsync()
  return await broadcast
}

describe("broadcastToWorkspaceParty aggregator (B1)", () => {
  test("queues the first event until the coalesce window elapses", async () => {
    const queued = broadcastToWorkspaceParty("workspace_1", typingEvent)

    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await expect(queued).resolves.toBe(1)

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      { secret: "s".repeat(32), url: "http://realtime:1999" },
      "workspace_1",
      [typingEvent],
    )
  })

  test("flushes after 25 ms", async () => {
    const queued = broadcastToWorkspaceParty("workspace_1", typingEvent)

    await vi.advanceTimersByTimeAsync(24)
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(queued).resolves.toBe(1)
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("keeps the coalesce window at 25 ms during a burst", async () => {
    const first = broadcastToWorkspaceParty("workspace_1", typingEvent)
    await vi.advanceTimersByTimeAsync(25)
    await first

    const burst = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    await vi.advanceTimersByTimeAsync(24)
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(2)
    await flushPendingWorkspaceBroadcasts("workspace_1")
    await burst

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(2)
  })

  test("coalesces all events queued during the window into one batch request", async () => {
    const first = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const second = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    const third = broadcastToWorkspaceParty(
      "workspace_1",
      conversationAssignedEvent,
    )

    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await Promise.all([first, second, third])

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [typingEvent, contactBlockedEvent, conversationAssignedEvent],
    )
  })

  test("flushes immediately once the max event count is reached, without waiting for the coalesce window", async () => {
    const queued = Array.from({ length: WORKSPACE_BROADCAST_MAX_EVENTS }, () =>
      broadcastToWorkspaceParty("workspace_1", contactBlockedEvent),
    )
    await Promise.all(queued)

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    const [, , batch] = broadcastToWorkspacePartyLow.mock.calls[0] as [
      unknown,
      unknown,
      unknown[],
    ]
    expect(batch).toHaveLength(WORKSPACE_BROADCAST_MAX_EVENTS)
  })

  test("flushes a pending batch immediately when a VoIP event arrives", async () => {
    const pending = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const voip = broadcastToWorkspaceParty("workspace_1", voipEvent)

    await Promise.all([pending, voip])

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [typingEvent, voipEvent],
    )
  })

  test("serializes an overflow flush before the next batch", async () => {
    const oversizedEvent = {
      eventType: "contactBlocked" as const,
      data: { contactId: "x".repeat(WORKSPACE_BROADCAST_MAX_BYTES) },
    }
    const first = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const second = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    const third = broadcastToWorkspaceParty("workspace_1", oversizedEvent)

    await vi.runAllTimersAsync()
    await Promise.all([first, second, third])

    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "workspace_1",
      [typingEvent, contactBlockedEvent],
    )
    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "workspace_1",
      [oversizedEvent],
    )
  })

  test("flushPendingWorkspaceBroadcasts drains a pending batch on demand, ahead of the timer", async () => {
    const queued = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const interested = await flushPendingWorkspaceBroadcasts("workspace_1")
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    expect(interested).toBe(1)
  })

  test("resolves every waiter with null when a batched relay request rejects", async () => {
    broadcastToWorkspacePartyLow.mockRejectedValueOnce(new Error("relay down"))
    const first = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const second = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)

    await vi.runOnlyPendingTimersAsync()

    await expect(Promise.all([first, second])).resolves.toEqual([null, null])
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [typingEvent, contactBlockedEvent],
    )
  })

  test("flushPendingWorkspaceBroadcasts is a no-op when nothing is pending", async () => {
    await expect(
      flushPendingWorkspaceBroadcasts("workspace_never_used"),
    ).resolves.toBeNull()
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()
  })

  test("flushAllPendingWorkspaceBroadcasts drains every workspace", async () => {
    const first = broadcastToWorkspaceParty("workspace_1", typingEvent)
    const second = broadcastToWorkspaceParty("workspace_2", contactBlockedEvent)

    await flushAllPendingWorkspaceBroadcasts()
    await Promise.all([first, second])

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(2)
  })

  test("publishes without making a caller await relay delivery", async () => {
    const result = publishToWorkspaceParty("workspace_1", typingEvent)
    await vi.runOnlyPendingTimersAsync()

    expect(result).toBeUndefined()
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [typingEvent],
    )
  })
})

describe("chat delivery negative cache (B4)", () => {
  test("suppresses typing for the TTL after the relay reports zero interest, without hitting the network", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const interested = await broadcastToWorkspaceParty(
      "workspace_1",
      typingEvent,
    )

    expect(interested).toBe(0)
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()
  })

  test("continues broadcasting durable chat events while the typing gate is active", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", messageCreatedEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [messageCreatedEvent],
    )
  })

  test("stops suppressing once the negative-cache TTL elapses", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()
    broadcastToWorkspacePartyLow.mockResolvedValue(1)

    await vi.advanceTimersByTimeAsync(2001)
    await broadcastAndFlush("workspace_1", contactBlockedEvent)

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("a relay response with nonzero interest never sets the negative cache", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(3)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("never suppresses a mixed chat+voip event, even while the chat gate is active", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty(
      "workspace_1",
      conversationAssignedEvent,
    )
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("never suppresses a voip-only event, even while the chat gate is active", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", voipEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("fails open when REALTIME_DELIVERY_GATE is disabled", async () => {
    resolveRealtimeDeliveryGate.mockReturnValue(false)
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastAndFlush("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })
})
