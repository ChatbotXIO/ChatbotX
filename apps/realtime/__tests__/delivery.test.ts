import { REALTIME_CLOSE_CODE } from "@chatbotx.io/realtime-protocol"
import { describe, expect, test } from "vitest"
import {
  createRealtimeDelivery,
  type GuestSocketData,
  type WorkspaceSocket,
  type WorkspaceSocketData,
} from "../src/delivery"
import { createRealtimeServerCounters } from "../src/lib/realtime-metrics"

const createSocket = (
  overrides: Partial<WorkspaceSocketData> = {},
): WorkspaceSocket & {
  closed: { code?: number; reason?: string } | null
  sent: string[]
} => {
  const data: WorkspaceSocketData = {
    chatScope: "all",
    closed: false,
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
  const delivery = createRealtimeDelivery(
    {
      publish: (topic, message) => {
        published.push({ message, topic })
        return true
      },
    },
    createRealtimeServerCounters(),
  )
  return { delivery, published }
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

  test("closes every targeted member socket on revoke", () => {
    const { delivery } = createDelivery()
    const socket = createSocket()
    delivery.addWorkspaceSocket(socket)

    delivery.dispatch({
      id: "3-0",
      record: {
        kind: "member-revoke",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    })

    expect(socket.closed).toEqual({ code: 4001, reason: "revoked" })
  })

  test("publishes a guest event to a topic scoped by workspace, not just the guest conversation id", () => {
    const { delivery, published } = createDelivery()

    delivery.dispatch({
      id: "4-0",
      record: {
        event: { data: {}, eventType: "messageCreated" },
        guestConversationId: "12345",
        kind: "guest-event",
        workspaceId: "workspace-1",
      },
    })

    expect(published).toEqual([
      {
        message: JSON.stringify({
          batch: [{ data: {}, eventType: "messageCreated" }],
          seq: "4-0",
        }),
        topic: "guest:workspace-1:12345",
      },
    ])
  })

  test("isolates guest events between workspaces that share the same legacy guestConversationId", () => {
    const { delivery, published } = createDelivery()

    delivery.dispatch({
      id: "5-0",
      record: {
        event: { data: {}, eventType: "messageCreated" },
        guestConversationId: "12345",
        kind: "guest-event",
        workspaceId: "workspace-1",
      },
    })
    delivery.dispatch({
      id: "6-0",
      record: {
        event: { data: {}, eventType: "messageCreated" },
        guestConversationId: "12345",
        kind: "guest-event",
        workspaceId: "workspace-2",
      },
    })

    const topics = published.map((entry) => entry.topic)
    expect(topics).toEqual([
      "guest:workspace-1:12345",
      "guest:workspace-2:12345",
    ])
    expect(new Set(topics).size).toBe(2)
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
})
