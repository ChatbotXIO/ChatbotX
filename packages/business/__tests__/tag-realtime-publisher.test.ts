// @vitest-environment node

import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { beforeEach, describe, expect, test, vi } from "vitest"

const queueWorkspaceRealtimeEvent = vi.fn(async () => undefined)
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent,
}))

const { publishContactTagsChanged } = await import("../src/tag/realtime")

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index + 1))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("publishContactTagsChanged", () => {
  test("publishes nothing for an empty change", async () => {
    await publishContactTagsChanged({ workspaceId: "ws-1", contactIds: [] })

    expect(queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
  })

  test("publishes one workspace event with the distinct changed contacts", async () => {
    await publishContactTagsChanged({
      workspaceId: "ws-1",
      contactIds: ["1", "2", "1"],
    })

    expect(queueWorkspaceRealtimeEvent).toHaveBeenCalledExactlyOnceWith(
      "ws-1",
      {
        eventType: RealtimeEventType.contactTagsChanged,
        data: { contactIds: ["1", "2"] },
      },
    )
  })

  test("splits a large change into events of at most 500 contacts", async () => {
    await publishContactTagsChanged({
      workspaceId: "ws-1",
      contactIds: ids(1201),
    })

    const sizes = queueWorkspaceRealtimeEvent.mock.calls.map(
      (call) =>
        (call as unknown as [string, { data: { contactIds: string[] } }])[1]
          .data.contactIds.length,
    )
    expect(sizes).toEqual([500, 500, 201])
  })
})
