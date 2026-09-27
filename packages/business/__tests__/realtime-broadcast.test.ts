import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  flushAllPendingWorkspaceRealtimeEvents,
  publishGuestRealtimeEvent,
  publishWorkspaceMemberRealtimeEvent,
  publishWorkspaceRealtimeEvent,
  resetRealtimePublishStateForTests,
  revokeWorkspaceMemberRealtimeConnections,
} from "../src/platform/realtime-broadcast"

const { publishRealtimeStreamRecord } = vi.hoisted(() => ({
  publishRealtimeStreamRecord: vi.fn(),
}))

vi.mock("../src/platform/realtime-stream-publisher", () => ({
  publishRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests: vi.fn(),
}))

const typingEvent = {
  data: { typing: true },
  eventType: "typing",
} as const

beforeEach(() => {
  vi.useFakeTimers()
  publishRealtimeStreamRecord.mockReset()
  publishRealtimeStreamRecord.mockResolvedValue(undefined)
  resetRealtimePublishStateForTests()
})

afterEach(() => {
  resetRealtimePublishStateForTests()
  vi.useRealTimers()
})

describe("realtime stream broadcast", () => {
  test("coalesces workspace events into one durable stream record", async () => {
    const first = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)
    const second = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)

    await vi.advanceTimersByTimeAsync(25)
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])

    expect(publishRealtimeStreamRecord).toHaveBeenCalledWith({
      events: [typingEvent, typingEvent],
      kind: "workspace-events",
      workspaceId: "workspace_1",
    })
  })

  test("flushes pending workspace records before shutdown", async () => {
    const delivery = publishWorkspaceRealtimeEvent("workspace_1", typingEvent)

    await flushAllPendingWorkspaceRealtimeEvents()
    await expect(delivery).resolves.toBeUndefined()

    expect(publishRealtimeStreamRecord).toHaveBeenCalledTimes(1)
  })

  test("publishes directed member, revocation, and guest records directly", async () => {
    await expect(
      publishWorkspaceMemberRealtimeEvent(
        { userId: "user_1", workspaceId: "workspace_1" },
        typingEvent,
      ),
    ).resolves.toBeUndefined()
    await expect(
      revokeWorkspaceMemberRealtimeConnections({
        userId: "user_1",
        workspaceId: "workspace_1",
      }),
    ).resolves.toBeUndefined()
    await expect(
      publishGuestRealtimeEvent(
        { guestConversationId: "guest_1", workspaceId: "workspace_1" },
        typingEvent,
      ),
    ).resolves.toBeUndefined()

    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(1, {
      event: typingEvent,
      kind: "member-send",
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(2, {
      kind: "member-revoke",
      userId: "user_1",
      workspaceId: "workspace_1",
    })
    expect(publishRealtimeStreamRecord).toHaveBeenNthCalledWith(3, {
      event: typingEvent,
      guestConversationId: "guest_1",
      kind: "guest-event",
      workspaceId: "workspace_1",
    })
  })
})
