import { describe, expect, it } from "vitest"
import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  getWorkspaceAllTopic,
  getWorkspaceConnectionTopics,
  getWorkspaceEventTopics,
  getWorkspaceTeamTopic,
  getWorkspaceUserTopic,
} from "../src/gateway-protocol"

describe("gateway protocol", () => {
  it("maps each workspace deterministically to one bounded Redis Stream shard", () => {
    const shard = getRealtimeStreamShard("workspace-1")

    expect(shard).toBeGreaterThanOrEqual(0)
    expect(shard).toBeLessThan(256)
    expect(getRealtimeStreamShard("workspace-1")).toBe(shard)
    expect(getRealtimeStreamKey("workspace-1")).toBe(`rt:{${shard}}`)
  })

  it("subscribes an assigned member only to its user and team topics", () => {
    expect(
      getWorkspaceConnectionTopics({
        workspaceId: "workspace-1",
        userId: "user-1",
        chatScope: "assigned",
        teamIds: ["team-1", "team-2"],
      }),
    ).toEqual([
      getWorkspaceUserTopic("workspace-1", "user-1"),
      getWorkspaceTeamTopic("workspace-1", "team-1"),
      getWorkspaceTeamTopic("workspace-1", "team-2"),
    ])
  })

  it("publishes routed events to full-access and route-specific topics", () => {
    expect(
      getWorkspaceEventTopics("workspace-1", {
        eventType: "messageCreated",
        data: {},
        route: {
          assignedTeamIds: ["team-1"],
          assignedUserIds: ["user-1"],
          inboxId: "inbox-1",
        },
      }),
    ).toEqual([
      getWorkspaceAllTopic("workspace-1"),
      "ws:workspace-1:inbox:inbox-1",
      getWorkspaceTeamTopic("workspace-1", "team-1"),
      getWorkspaceUserTopic("workspace-1", "user-1"),
    ])
  })

  it("keeps unrouted events away from assigned-only members", () => {
    expect(
      getWorkspaceEventTopics("workspace-1", {
        eventType: "messageCreated",
        data: {},
      }),
    ).toEqual([getWorkspaceAllTopic("workspace-1")])
  })
})
