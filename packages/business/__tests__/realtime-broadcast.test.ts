import type * as PartysocketConfig from "@chatbotx.io/partysocket-config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  broadcastToWorkspaceParty,
  flushPendingWorkspaceBroadcasts,
  resetRealtimeBroadcastStateForTests,
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

describe("broadcastToWorkspaceParty aggregator (B1)", () => {
  test("sends the first event for a workspace immediately, as a single event, without waiting for the coalesce window", async () => {
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    await broadcastToWorkspaceParty("workspace_2", typingEvent)
    expect(resolveTenantSettings).not.toHaveBeenCalled()
    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      1,
      { secret: "s".repeat(32), url: "http://realtime:1999" },
      "workspace_1",
      typingEvent,
    )
    expect(broadcastToWorkspacePartyLow).toHaveBeenNthCalledWith(
      2,
      { secret: "s".repeat(32), url: "http://realtime:1999" },
      "workspace_2",
      typingEvent,
    )
  })

  test("coalesces events queued behind an in-flight first send into one batch request", async () => {
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const second = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    const third = broadcastToWorkspaceParty(
      "workspace_1",
      conversationAssignedEvent,
    )

    // Not sent yet — still inside the coalesce window.
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    await Promise.all([second, third])

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledWith(
      expect.anything(),
      "workspace_1",
      [contactBlockedEvent, conversationAssignedEvent],
    )
  })

  test("flushes immediately once the max event count is reached, without waiting for the coalesce window", async () => {
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

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

  test("flushPendingWorkspaceBroadcasts drains a pending batch on demand, ahead of the timer", async () => {
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    const interested = await flushPendingWorkspaceBroadcasts("workspace_1")
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
    expect(interested).toBe(1)
  })

  test("flushPendingWorkspaceBroadcasts is a no-op when nothing is pending", async () => {
    await expect(
      flushPendingWorkspaceBroadcasts("workspace_never_used"),
    ).resolves.toBeNull()
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()
  })
})

describe("chat delivery negative cache (B4)", () => {
  test("suppresses a chat-only broadcast for the TTL after the relay reports zero interest, without hitting the network", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const interested = await broadcastToWorkspaceParty(
      "workspace_1",
      contactBlockedEvent,
    )

    expect(interested).toBe(0)
    expect(broadcastToWorkspacePartyLow).not.toHaveBeenCalled()
  })

  test("stops suppressing once the negative-cache TTL elapses", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()
    broadcastToWorkspacePartyLow.mockResolvedValue(1)

    await vi.advanceTimersByTimeAsync(2001)
    await broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("a relay response with nonzero interest never sets the negative cache", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(3)
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("never suppresses a mixed chat+voip event, even while the chat gate is active", async () => {
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
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
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", voipEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })

  test("fails open when REALTIME_DELIVERY_GATE is disabled", async () => {
    resolveRealtimeDeliveryGate.mockReturnValue(false)
    broadcastToWorkspacePartyLow.mockResolvedValueOnce(0)
    await broadcastToWorkspaceParty("workspace_1", typingEvent)
    broadcastToWorkspacePartyLow.mockClear()

    const queued = broadcastToWorkspaceParty("workspace_1", contactBlockedEvent)
    await vi.runOnlyPendingTimersAsync()
    await queued

    expect(broadcastToWorkspacePartyLow).toHaveBeenCalledTimes(1)
  })
})
