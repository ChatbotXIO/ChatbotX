import { REALTIME_CLOSE_CODE } from "@chatbotx.io/realtime-protocol"
import { describe, expect, test, vi } from "vitest"

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { warn: loggerWarnMock },
}))

import {
  createRealtimeDelivery,
  type GuestSocketData,
  type WorkspaceSocketData,
} from "../src/delivery"
import { createRealtimeServerCounters } from "../src/lib/realtime-metrics"

type TestWorkspaceSocket = {
  closed: { code?: number; reason?: string } | null
  end: (code?: number, reason?: string) => void
  getUserData: () => WorkspaceSocketData
  send: (data: string) => number
  sent: string[]
  subscribe: (topic: string) => void
}

const createSocket = (
  overrides: Partial<WorkspaceSocketData> = {},
): TestWorkspaceSocket => {
  const data: WorkspaceSocketData = {
    chatScope: "all",
    closed: false,
    iat: 0,
    replayEntries: [],
    teamIds: [],
    userId: "user-1",
    workspaceId: "workspace-1",
    ...overrides,
  }
  const socket = {
    closed: null as { code?: number; reason?: string } | null,
    end(code?: number, reason?: string): void {
      this.closed = { code, reason }
    },
    getUserData: () => data,
    send(data: string): number {
      this.sent.push(data)
      return 1
    },
    sent: [] as string[],
    subscribe: () => undefined,
  }
  return socket
}

const createGuestSocket = (
  overrides: Partial<GuestSocketData> = {},
): {
  closed: { code?: number; reason?: string } | null
  end: (code?: number, reason?: string) => void
  endCalls: number
  getUserData: () => GuestSocketData
  send: (data: string) => number
} => {
  const data: GuestSocketData = {
    closed: false,
    guestConversationId: "guest-1",
    replayCutoff: "0-0",
    replayEntries: [],
    workspaceId: "workspace-1",
    ...overrides,
  }
  const socket = {
    closed: null as { code?: number; reason?: string } | null,
    end(code?: number, reason?: string): void {
      this.endCalls += 1
      this.closed = { code, reason }
    },
    endCalls: 0,
    getUserData: () => data,
    send: (): number => 2,
  }
  return socket
}

const createDelivery = () => {
  const published: { message: string; topic: string }[] = []
  const counters = createRealtimeServerCounters()
  const delivery = createRealtimeDelivery(
    {
      publish: (topic, message) => {
        published.push({ message, topic })
        return true
      },
    },
    counters,
  )
  return { counters, delivery, published }
}

const workspaceEntry = (events: unknown[]) => ({
  id: "1-0",
  record: {
    events,
    kind: "workspace-events" as const,
    workspaceId: "workspace-1",
  },
})

describe("realtime delivery", () => {
  test("publishes every event from a record in one frame", () => {
    const { delivery, published } = createDelivery()

    delivery.dispatch(
      workspaceEntry([
        { data: { id: "message-1" }, eventType: "messageCreated" },
        { data: { id: "message-2" }, eventType: "messageCreated" },
      ]),
    )

    expect(published).toEqual([
      {
        message: JSON.stringify({
          batch: [
            { data: { id: "message-1" }, eventType: "messageCreated" },
            { data: { id: "message-2" }, eventType: "messageCreated" },
          ],
          seq: "1-0",
        }),
        topic: "ws:workspace-1:all",
      },
    ])
  })

  test("records, logs, and resyncs a socket when sending fails", () => {
    const { counters, delivery } = createDelivery()
    const error = new Error("socket write failed")
    const socket = createSocket()
    socket.send = () => {
      throw error
    }
    expect(
      delivery.replayWorkspaceSocket(socket, [
        workspaceEntry([{ data: {}, eventType: "messageCreated" }]),
      ]),
    ).toBe(false)

    expect(counters.sendFailures).toBe(1)
    expect(socket.closed).toEqual({
      code: REALTIME_CLOSE_CODE.resync,
      reason: "send-failed",
    })
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, workspaceId: "workspace-1" },
      "Realtime send failed",
    )
  })

  test("delivers one filtered copy to an assigned user who is also on the team", () => {
    const { delivery } = createDelivery()
    const socket = createSocket({ chatScope: "assigned", teamIds: ["team-1"] })
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch(
      workspaceEntry([
        {
          data: {},
          eventType: "messageCreated",
          route: { assignedTeamIds: ["team-1"], assignedUserIds: ["user-1"] },
        },
      ]),
    )

    expect(socket.sent).toHaveLength(1)
  })

  test("sends unrouted events only through the full-access topic", () => {
    const { delivery, published } = createDelivery()
    const socket = createSocket({ chatScope: "assigned" })
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch(
      workspaceEntry([{ data: {}, eventType: "messageCreated" }]),
    )

    expect(socket.sent).toEqual([])
    expect(published[0]?.topic).toBe("ws:workspace-1:all")
  })

  test("delivers directed member events to a full-access socket", () => {
    const { delivery } = createDelivery()
    const socket = createSocket()
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch({
      id: "2-0",
      record: {
        event: { data: {}, eventType: "whatsappCallTransportIncoming" },
        kind: "member-send",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    })

    expect(socket.sent).toHaveLength(1)
  })

  test.each([
    ["deleted", { code: 4001, reason: "revoked" }],
    ["reauth", { code: 4004, reason: "reauth" }],
  ] as const)("closes a targeted member socket with the $0 code", (reason, expectedClose) => {
    const { delivery } = createDelivery()
    const socket = createSocket()
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch({
      id: "3-0",
      record: {
        kind: "member-revoke",
        reason,
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    })

    expect(socket.closed).toEqual(expectedClose)
  })

  test("replay never closes on a member-revoke entry — revocation is checked once at connect, not re-derived from stream-entry clocks", () => {
    // Regression for PR #1349 round-4 finding #5: this used to compare a
    // Redis stream entry's auto-generated id (the Redis server's clock)
    // against the token's `iat` (the builder's clock) to decide whether a
    // revoke sitting in the replay window was "stale". That comparison is
    // now entirely superseded by an authoritative check the gateway makes
    // once at connect time (`getRealtimeMemberRevokedKey` against `iat`,
    // independent of whether the connect even carries a `lastSeq`) — by the
    // time any entries reach `replayWorkspaceSocket`, a genuinely-revoked
    // member's connect was already rejected, so a `member-revoke` entry
    // surviving into replay must never re-close the socket here.
    const { delivery } = createDelivery()
    const socket = createSocket({ iat: 10 })

    const result = delivery.replayWorkspaceSocket(socket, [
      {
        id: "11000-0",
        record: {
          kind: "member-revoke",
          reason: "deleted",
          userId: "user-1",
          workspaceId: "workspace-1",
        },
      },
    ])

    expect(result).toBe(true)
    expect(socket.closed).toBeNull()
  })

  test.each([
    {
      expectedTopics: ["guest:workspace-1:12345"],
      name: "a guest event to its workspace-scoped topic",
      workspaceIds: ["workspace-1"],
    },
    {
      expectedTopics: ["guest:workspace-1:12345", "guest:workspace-2:12345"],
      name: "legacy guest conversation ids independently per workspace",
      workspaceIds: ["workspace-1", "workspace-2"],
    },
  ])("publishes $name", ({ expectedTopics, workspaceIds }) => {
    const { delivery, published } = createDelivery()
    for (const [index, workspaceId] of workspaceIds.entries()) {
      delivery.dispatch({
        id: `${index + 4}-0`,
        record: {
          event: { data: {}, eventType: "messageCreated" },
          guestConversationId: "12345",
          kind: "guest-event",
          workspaceId,
        },
      })
    }

    const topics = published.map((entry) => entry.topic)
    expect(topics).toEqual(expectedTopics)
    expect(new Set(topics).size).toBe(expectedTopics.length)
  })

  test("closes a socket on a backpressure drop and does not close it a second time once already closed", () => {
    const { delivery } = createDelivery()
    const socket = createGuestSocket()

    delivery.replayGuestSocket(socket, [
      {
        id: "7-0",
        record: {
          event: { data: {}, eventType: "messageCreated" },
          guestConversationId: "guest-1",
          kind: "guest-event",
          workspaceId: "workspace-1",
        },
      },
      {
        id: "8-0",
        record: {
          event: { data: {}, eventType: "messageCreated" },
          guestConversationId: "guest-1",
          kind: "guest-event",
          workspaceId: "workspace-1",
        },
      },
    ])

    expect(socket.closed).toEqual({
      code: REALTIME_CLOSE_CODE.resync,
      reason: "backpressure-drop",
    })
    expect(socket.getUserData().closed).toBe(true)
    expect(socket.endCalls).toBe(1)
  })

  test("stops replay without reading socket data after send closes the socket", () => {
    const { delivery } = createDelivery()
    const socketData: GuestSocketData = {
      closed: false,
      guestConversationId: "guest-1",
      replayCutoff: "0-0",
      replayEntries: [],
      workspaceId: "workspace-1",
    }
    let sent = false
    const socket = {
      end: () => undefined,
      getUserData: () => {
        if (sent) {
          throw new Error("uWS socket data is unavailable after send")
        }
        return socketData
      },
      send: () => {
        sent = true
        socketData.closed = true
        return 2
      },
    }

    expect(
      delivery.replayGuestSocket(socket, [
        {
          id: "9-0",
          record: {
            event: { data: {}, eventType: "messageCreated" },
            guestConversationId: "guest-1",
            kind: "guest-event",
            workspaceId: "workspace-1",
          },
        },
      ]),
    ).toBe(false)
  })

  test("continues restricted fan-out after a socket closes during send", () => {
    const { delivery } = createDelivery()
    const closingSocket = createSocket({
      chatScope: "assigned",
      teamIds: ["team-1"],
    })
    const receivingSocket = createSocket({
      chatScope: "assigned",
      teamIds: ["team-1"],
    })
    closingSocket.send = () => {
      closingSocket.getUserData().closed = true
      return 2
    }
    delivery.addWorkspaceSocket(closingSocket)
    delivery.addWorkspaceSocket(receivingSocket)

    delivery.dispatch(
      workspaceEntry([
        {
          data: {},
          eventType: "messageCreated",
          route: { assignedTeamIds: ["team-1"], assignedUserIds: [] },
        },
      ]),
    )

    expect(receivingSocket.sent).toHaveLength(1)
  })
  test("resyncWorkspace closes every registered member and guest socket of that workspace, and only that workspace", () => {
    // Regression for PR #1349 finding #4: a stream record the gateway
    // couldn't fully parse must force a resync on every local socket that
    // might have missed it, not just log a warning nobody sees.
    const { delivery } = createDelivery()
    const memberSocket = createSocket({ workspaceId: "workspace-1" })
    const otherWorkspaceMemberSocket = createSocket({
      userId: "user-2",
      workspaceId: "workspace-2",
    })
    const guestSocket = createGuestSocket({ workspaceId: "workspace-1" })
    const otherWorkspaceGuestSocket = createGuestSocket({
      guestConversationId: "guest-2",
      workspaceId: "workspace-2",
    })
    delivery.addWorkspaceSocket(memberSocket)
    delivery.addWorkspaceSocket(otherWorkspaceMemberSocket)
    delivery.addGuestSocket(guestSocket)
    delivery.addGuestSocket(otherWorkspaceGuestSocket)

    delivery.resyncWorkspace("workspace-1", "malformed-stream-record")

    expect(memberSocket.closed).toEqual({
      code: REALTIME_CLOSE_CODE.resync,
      reason: "malformed-stream-record",
    })
    expect(guestSocket.closed).toEqual({
      code: REALTIME_CLOSE_CODE.resync,
      reason: "malformed-stream-record",
    })
    expect(otherWorkspaceMemberSocket.closed).toBeNull()
    expect(otherWorkspaceGuestSocket.closed).toBeNull()
  })

  test("does not deliver a routed event assigned to another team or user to an assigned-scope socket", () => {
    const { delivery } = createDelivery()
    const socket = createSocket({ chatScope: "assigned", teamIds: ["team-1"] })
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch(
      workspaceEntry([
        {
          data: {},
          eventType: "messageCreated",
          route: {
            assignedTeamIds: ["team-2"],
            assignedUserIds: ["user-2"],
          },
        },
      ]),
    )

    expect(socket.sent).toEqual([])
  })

  test("delivers nothing to a chatScope: none socket, routed or not", () => {
    const { delivery } = createDelivery()
    const socket = createSocket({ chatScope: "none", teamIds: ["team-1"] })
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch(
      workspaceEntry([
        { data: {}, eventType: "messageCreated" },
        {
          data: {},
          eventType: "messageCreated",
          route: { assignedTeamIds: ["team-1"], assignedUserIds: ["user-1"] },
        },
      ]),
    )

    expect(socket.sent).toEqual([])
  })

  test("replay applies the same scope filter as live dispatch", () => {
    const { delivery } = createDelivery()
    const assignedSocket = createSocket({
      chatScope: "assigned",
      teamIds: ["team-1"],
    })
    const noneSocket = createSocket({ chatScope: "none", userId: "user-2" })

    const entries = [
      {
        id: "9-0",
        record: {
          events: [
            {
              data: { id: "mine" },
              eventType: "messageCreated",
              route: {
                assignedTeamIds: ["team-1"],
                assignedUserIds: ["user-1"],
              },
            },
            {
              data: { id: "not-mine" },
              eventType: "messageCreated",
              route: {
                assignedTeamIds: ["team-2"],
                assignedUserIds: ["user-2"],
              },
            },
          ],
          kind: "workspace-events" as const,
          workspaceId: "workspace-1",
        },
      },
    ]

    delivery.replayWorkspaceSocket(assignedSocket, entries)
    delivery.replayWorkspaceSocket(noneSocket, entries)

    expect(assignedSocket.sent).toEqual([
      JSON.stringify({
        batch: [
          {
            data: { id: "mine" },
            eventType: "messageCreated",
            route: { assignedTeamIds: ["team-1"], assignedUserIds: ["user-1"] },
          },
        ],
        seq: "9-0",
      }),
    ])
    expect(noneSocket.sent).toEqual([])
  })

  test("never replays a guest record from another workspace onto a guest socket, even sharing the same conversation id", () => {
    const { delivery } = createDelivery()
    const socket = createGuestSocket({
      guestConversationId: "12345",
      workspaceId: "workspace-a",
    })

    delivery.replayGuestSocket(socket, [
      {
        id: "10-0",
        record: {
          event: { data: {}, eventType: "messageCreated" },
          guestConversationId: "12345",
          kind: "guest-event",
          workspaceId: "workspace-b",
        },
      },
    ])

    expect(socket.closed).toBeNull()
  })

  test("sendCursor sends an empty-batch frame carrying only the seq", () => {
    const { delivery } = createDelivery()
    const socket = createSocket()

    delivery.sendCursor(socket, "5-0")

    expect(socket.sent).toEqual([JSON.stringify({ batch: [], seq: "5-0" })])
  })

  test("sendCursor is a no-op once the socket is already closed", () => {
    const { delivery } = createDelivery()
    const socket = createSocket({ closed: true })

    delivery.sendCursor(socket, "5-0")

    expect(socket.sent).toEqual([])
  })
})
