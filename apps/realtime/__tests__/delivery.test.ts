import { describe, expect, test } from "vitest"
import {
  createRealtimeDelivery,
  type WorkspaceSocket,
  type WorkspaceSocketData,
} from "../src/delivery"

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
    send(data: string): void {
      this.sent.push(data)
    },
    sent: [] as string[],
    subscribe: () => undefined,
  }
  return socket
}

const createDelivery = () => {
  const published: { message: string; topic: string }[] = []
  const delivery = createRealtimeDelivery({
    publish: (topic, message) => {
      published.push({ message, topic })
      return true
    },
  })
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
})
