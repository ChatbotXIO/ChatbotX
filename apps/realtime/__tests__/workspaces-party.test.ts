import { serializeRealtimeSubscriptionMessage } from "@chatbotx.io/partysocket-config"
import {
  REALTIME_TOKEN_PURPOSE,
  signMemberConnectToken,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import { serializePresencePingMessage } from "@chatbotx.io/partysocket-config/presence"
import type * as Party from "partykit/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { SECRET, reportWorkspacePresenceMock } = vi.hoisted(() => ({
  SECRET: "s".repeat(32),
  reportWorkspacePresenceMock: vi.fn(),
}))

vi.mock("../src/env", () => ({
  env: { REALTIME_BROADCAST_SECRET: SECRET },
}))

vi.mock("../src/lib/presence-report", () => ({
  reportWorkspacePresence: reportWorkspacePresenceMock,
}))

import WorkspaceParty, {
  PRESENCE_REPORT_INTERVAL_MS,
} from "../src/parties/workspaces"

let connectionIdCounter = 0

type FakeConnectionState = {
  userId: string
  protocol?: "v1" | "v2"
  topics?: string[]
}

class FakeConnection {
  id = String(connectionIdCounter++)
  sent: string[] = []
  closed: { code?: number; reason?: string } | null = null
  state: FakeConnectionState | null = null
  send(message: string) {
    this.sent.push(message)
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason }
  }
  setState(state: FakeConnectionState | null) {
    this.state = state
    return this.state
  }
}

/** Mirrors DurableObjectStorage's alarm + key-value surface closely enough
 * for `WorkspaceParty`'s own usage of `room.storage`. */
class FakeStorage {
  alarmAt: number | null = null
  private readonly data = new Map<string, unknown>()

  setAlarm(time: number): Promise<void> {
    this.alarmAt = time
    return Promise.resolve()
  }
  getAlarm(): Promise<number | null> {
    return Promise.resolve(this.alarmAt)
  }
  deleteAlarm(): Promise<void> {
    this.alarmAt = null
    return Promise.resolve()
  }
  put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
    return Promise.resolve()
  }
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.data.get(key) as T | undefined)
  }
  delete(key: string): Promise<boolean> {
    return Promise.resolve(this.data.delete(key))
  }
}

class FakeRoom {
  id: string
  broadcastCalls: string[] = []
  storage = new FakeStorage()
  private readonly connectionsByTag = new Map<string, FakeConnection[]>()
  private readonly allConnections: FakeConnection[] = []

  constructor(id: string) {
    this.id = id
  }

  registerTaggedConnection(tag: string, connection: FakeConnection) {
    const existing = this.connectionsByTag.get(tag) ?? []
    this.connectionsByTag.set(tag, [...existing, connection])
    if (!this.allConnections.includes(connection)) {
      this.allConnections.push(connection)
    }
  }

  registerConnection(connection: FakeConnection) {
    this.allConnections.push(connection)
  }

  removeConnection(connection: FakeConnection) {
    const index = this.allConnections.indexOf(connection)
    if (index !== -1) {
      this.allConnections.splice(index, 1)
    }
  }

  broadcast(message: string) {
    this.broadcastCalls.push(message)
  }

  getConnections(tag?: string): FakeConnection[] {
    if (tag === undefined) {
      return this.allConnections
    }
    return this.connectionsByTag.get(tag) ?? []
  }
}

const asRequest = (req: Request): Party.Request =>
  req as unknown as Party.Request
const asLobby = (id: string): Party.Lobby => ({ id }) as unknown as Party.Lobby
const asConnectionContext = (
  headers: Record<string, string>,
): Party.ConnectionContext =>
  ({
    request: new Request(
      "https://realtime.example.com/parties/workspaces/ws_1",
      {
        headers,
      },
    ),
  }) as unknown as Party.ConnectionContext

describe("WorkspaceParty.onBeforeConnect", () => {
  it("accepts a token minted for this room and threads the verified userId onto the request", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBe(req)
    expect((result as Party.Request).headers.get("X-User-ID")).toBe("u_1")
  })

  it("rejects a cross-room replay — token minted for a different workspace", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_other", userId: "u_1" },
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects a token missing the userId claim", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.memberConnect,
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects when no token is provided", async () => {
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1"),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects a token signed with a different secret", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      "different-secret-32-chars-long!!",
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects a purpose-less connect token — member-connect never had a legacy window (round-2 tightening, no pre-existing token of this purpose can exist)", async () => {
    const { SignJWT } = await import("jose")
    const legacyShapedToken = await new SignJWT({ userId: "u_1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${legacyShapedToken}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("threads X-Realtime-Protocol: v2 onto the request when ?protocol=v2 is requested", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}&protocol=v2`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect((result as Party.Request).headers.get("X-Realtime-Protocol")).toBe(
      "v2",
    )
  })

  it("threads X-Realtime-Protocol: v1 when no ?protocol= is requested (default)", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect((result as Party.Request).headers.get("X-Realtime-Protocol")).toBe(
      "v1",
    )
  })

  it("rejects an unrecognized ?protocol= value with 400", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )
    const req = asRequest(
      new Request(
        `https://realtime.example.com/parties/workspaces/ws_1?token=${token}&protocol=v99`,
      ),
    )

    const result = await WorkspaceParty.onBeforeConnect(req, asLobby("ws_1"))

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
  })
})

describe("WorkspaceParty#getConnectionTags", () => {
  it("tags the connection with the verified userId from X-User-ID", () => {
    const party = new WorkspaceParty(
      new FakeRoom("ws_1") as unknown as Party.Room,
    )
    const tags = party.getConnectionTags(
      {} as Party.Connection,
      asConnectionContext({ "X-User-ID": "u_1" }),
    )

    expect(tags).toEqual(["user:u_1"])
  })

  it("returns no tags when X-User-ID is absent", () => {
    const party = new WorkspaceParty(
      new FakeRoom("ws_1") as unknown as Party.Room,
    )
    const tags = party.getConnectionTags(
      {} as Party.Connection,
      asConnectionContext({}),
    )

    expect(tags).toEqual([])
  })
})

describe("WorkspaceParty#onRequest", () => {
  let room: FakeRoom
  let party: WorkspaceParty
  let connectionA1: FakeConnection
  let connectionA2: FakeConnection
  let connectionB1: FakeConnection

  beforeEach(() => {
    room = new FakeRoom("ws_1")
    connectionA1 = new FakeConnection()
    connectionA2 = new FakeConnection()
    connectionB1 = new FakeConnection()
    room.registerTaggedConnection("user:u_a", connectionA1)
    room.registerTaggedConnection("user:u_a", connectionA2)
    room.registerTaggedConnection("user:u_b", connectionB1)
    party = new WorkspaceParty(room as unknown as Party.Room)
  })

  const postRequest = (path: string, body: unknown) =>
    new Request(`https://realtime.example.com${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as Party.Request

  it("delivers the raw event individually to every connection in the room when no target userId is given (per-connection v1 delivery — B2/B3)", async () => {
    const event = { eventType: "typing", data: { seconds: 1 } }

    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1", event),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ interested: 3 })
    expect(connectionA1.sent).toEqual([JSON.stringify(event)])
    expect(connectionA2.sent).toEqual([JSON.stringify(event)])
    expect(connectionB1.sent).toEqual([JSON.stringify(event)])
  })

  it("returns before a stalled presence report completes", async () => {
    connectionA1.setState({ userId: "u_a" })
    let resolveReport!: () => void
    reportWorkspacePresenceMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveReport = resolve
        }),
    )

    try {
      const response = await party.onRequest(
        postRequest("/parties/workspaces/ws_1", {
          eventType: "typing",
          data: { seconds: 1 },
        }),
      )

      expect(response.status).toBe(200)
      expect(connectionA1.sent).toHaveLength(1)
      await vi.waitFor(() =>
        expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", [
          "u_a",
        ]),
      )
    } finally {
      resolveReport()
    }
  })

  it("delivers only to the target user's tagged connections, never broadcasts", async () => {
    const event = {
      eventType: "whatsappCallTransportIncoming",
      data: { whatsappCallId: "c_1" },
    }

    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1?userId=u_a", event),
    )

    expect(response.status).toBe(200)
    expect(room.broadcastCalls).toEqual([])
    expect(connectionA1.sent).toEqual([JSON.stringify(event)])
    expect(connectionA2.sent).toEqual([JSON.stringify(event)])
    expect(connectionB1.sent).toEqual([])
  })

  it("a PRESENT-but-empty userId targets nobody — never falls back to a workspace broadcast", async () => {
    const event = { eventType: "whatsappCallTransportEnded", data: {} }

    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1?userId=", event),
    )

    expect(response.status).toBe(200)
    expect(room.broadcastCalls).toEqual([])
    expect(connectionA1.sent).toEqual([])
    expect(connectionB1.sent).toEqual([])
  })

  it("closes only the target user's tagged connections on revoke", async () => {
    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1?action=revoke&userId=u_a", {}),
    )

    expect(response.status).toBe(200)
    expect(connectionA1.closed).not.toBeNull()
    expect(connectionA2.closed).not.toBeNull()
    expect(connectionB1.closed).toBeNull()
    expect(room.broadcastCalls).toEqual([])
  })

  it("rejects a revoke request without a target userId", async () => {
    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1?action=revoke", {}),
    )

    expect(response.status).toBe(400)
    expect(connectionA1.closed).toBeNull()
  })

  const postBatchRequest = (path: string, events: unknown[]) =>
    new Request(`https://realtime.example.com${path}`, {
      method: "POST",
      headers: { "X-Realtime-Batch": "1" },
      body: JSON.stringify({ batch: events }),
    }) as unknown as Party.Request

  it("delivers one batch frame per v2 connection, filtered to its subscribed topics only (B2/B3)", async () => {
    connectionA1.setState({ userId: "u_a", protocol: "v2", topics: ["chat"] })
    connectionA2.setState({ userId: "u_a", protocol: "v2", topics: ["voip"] })
    connectionB1.setState({ userId: "u_b", protocol: "v1" })

    const chatEvent = {
      eventType: "messageDeleted",
      data: { messageIds: ["m1"] },
    }
    const voipEvent = {
      eventType: "whatsappCallClaimedElsewhere",
      data: { whatsappCallId: "c_1", wacid: "w_1", answeredByUserId: "u_x" },
    }

    const response = await party.onRequest(
      postBatchRequest("/parties/workspaces/ws_1", [chatEvent, voipEvent]),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ interested: 3 })
    expect(connectionA1.sent).toEqual([JSON.stringify({ batch: [chatEvent] })])
    expect(connectionA2.sent).toEqual([JSON.stringify({ batch: [voipEvent] })])
    expect(connectionB1.sent).toEqual([
      JSON.stringify(chatEvent),
      JSON.stringify(voipEvent),
    ])
  })

  it("excludes a v2 connection with no matching subscribed topic from delivery and the interested count", async () => {
    connectionA1.setState({ userId: "u_a", protocol: "v2", topics: ["voip"] })
    connectionA2.setState({ userId: "u_a", protocol: "v2", topics: [] })
    connectionB1.setState({ userId: "u_b", protocol: "v1" })
    const chatEvent = {
      eventType: "messageDeleted",
      data: { messageIds: ["m1"] },
    }

    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1", chatEvent),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ interested: 1 })
    expect(connectionA1.sent).toEqual([])
    expect(connectionA2.sent).toEqual([])
    expect(connectionB1.sent).toEqual([JSON.stringify(chatEvent)])
  })

  it("rejects a malformed batch envelope with 400 Bad Request", async () => {
    const response = await party.onRequest(
      postBatchRequest("/parties/workspaces/ws_1", ["not-an-event"]),
    )

    expect(response.status).toBe(400)
    expect(connectionA1.sent).toEqual([])
  })
})

describe("WorkspaceParty presence reporting", () => {
  const connectionContext = (userId: string): Party.ConnectionContext =>
    ({
      request: new Request(
        "https://realtime.example.com/parties/workspaces/ws_1",
        { headers: { "X-User-ID": userId } },
      ),
    }) as unknown as Party.ConnectionContext

  beforeEach(() => {
    vi.clearAllMocks()
    reportWorkspacePresenceMock.mockResolvedValue(undefined)
  })

  describe("onConnect", () => {
    it("stores this connection's verified userId, plus default v1 protocol and empty topics, as connection state", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()

      await party.onConnect(
        connection as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(connection.state).toEqual({
        protocol: "v1",
        topics: [],
        userId: "u_1",
      })
    })

    it("schedules the report alarm on the room's first connection", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()

      expect(await room.storage.getAlarm()).toBeNull()

      await party.onConnect(
        connection as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(await room.storage.getAlarm()).not.toBeNull()
    })

    it("reports presence immediately on the room's first connection (HIGH-2: no blind window before the first alarm fires)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()

      await party.onConnect(
        connection as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", ["u_1"])
    })

    it("caches the room id in storage only on the first connection (LOW-11)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(await room.storage.get("presenceWorkspaceId")).toBe("ws_1")
    })

    it("does not reschedule the alarm or report again for a second connection while one is already pending", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_1"),
      )
      const firstAlarm = await room.storage.getAlarm()

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_2"),
      )

      expect(await room.storage.getAlarm()).toBe(firstAlarm)
      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
    })

    it("produces exactly one report containing every connected user id when two onConnect calls race (MEDIUM-c)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connectionA = new FakeConnection()
      const connectionB = new FakeConnection()
      room.registerConnection(connectionA)
      room.registerConnection(connectionB)

      await Promise.all([
        party.onConnect(
          connectionA as unknown as Party.Connection,
          connectionContext("u_a"),
        ),
        party.onConnect(
          connectionB as unknown as Party.Connection,
          connectionContext("u_b"),
        ),
      ])

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
      const [, reportedUserIds] = reportWorkspacePresenceMock.mock.calls[0] as [
        string,
        string[],
      ]
      expect(new Set(reportedUserIds)).toEqual(new Set(["u_a", "u_b"]))
    })

    it("closes the connection with 1008 and never schedules an alarm when X-User-ID is missing", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()

      await party.onConnect(
        connection as unknown as Party.Connection,
        {
          request: new Request(
            "https://realtime.example.com/parties/workspaces/ws_1",
          ),
        } as unknown as Party.ConnectionContext,
      )

      expect(connection.closed).toEqual({ code: 1008, reason: "Unauthorized" })
      expect(await room.storage.getAlarm()).toBeNull()
    })
  })

  describe("onClose", () => {
    it("stops the alarm loop once the last connection in the room closes", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()
      room.registerConnection(connection)
      await room.storage.setAlarm(Date.now() + PRESENCE_REPORT_INTERVAL_MS)

      await party.onClose(connection as unknown as Party.Connection)

      expect(await room.storage.getAlarm()).toBeNull()
    })

    it("also clears the loop's freshness marker once the last connection closes, so a fast reconnect re-bootstraps instead of seeing a falsely-fresh loop", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()
      room.registerConnection(connection)
      await room.storage.put("presenceLastArmedAt", Date.now())

      await party.onClose(connection as unknown as Party.Connection)

      expect(await room.storage.get("presenceLastArmedAt")).toBeUndefined()
    })

    it("leaves the alarm running when other connections remain open", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const closing = new FakeConnection()
      const staying = new FakeConnection()
      room.registerConnection(closing)
      room.registerConnection(staying)
      const scheduledAt = Date.now() + PRESENCE_REPORT_INTERVAL_MS
      await room.storage.setAlarm(scheduledAt)

      await party.onClose(closing as unknown as Party.Connection)

      expect(await room.storage.getAlarm()).toBe(scheduledAt)
    })
  })

  describe("onAlarm", () => {
    it("reports the distinct connected user ids and reschedules the alarm", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      await room.storage.put("presenceWorkspaceId", "ws_1")
      const a = new FakeConnection()
      a.setState({ userId: "u_a" })
      const b = new FakeConnection()
      b.setState({ userId: "u_b" })
      room.registerConnection(a)
      room.registerConnection(b)

      await party.onAlarm()

      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", [
        "u_a",
        "u_b",
      ])
      expect(await room.storage.getAlarm()).not.toBeNull()
    })

    it("dedupes multiple connections belonging to the same user", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      await room.storage.put("presenceWorkspaceId", "ws_1")
      const tab1 = new FakeConnection()
      tab1.setState({ userId: "u_a" })
      const tab2 = new FakeConnection()
      tab2.setState({ userId: "u_a" })
      room.registerConnection(tab1)
      room.registerConnection(tab2)

      await party.onAlarm()

      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", ["u_a"])
    })

    it("skips the report entirely and does not reschedule when the room has no connections", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      await room.storage.put("presenceWorkspaceId", "ws_1")

      await party.onAlarm()

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
      expect(await room.storage.getAlarm()).toBeNull()
    })

    it("reschedules the alarm even when the cached workspace id is missing from storage (MEDIUM-6)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      // Deliberately never put "presenceWorkspaceId" — simulates a storage
      // inconsistency; there ARE connections, so the loop must keep going.
      const a = new FakeConnection()
      a.setState({ userId: "u_a" })
      room.registerConnection(a)

      await party.onAlarm()

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
      expect(await room.storage.getAlarm()).not.toBeNull()
    })

    it("schedules the next alarm BEFORE awaiting the report POST — fixed cadence, latency-independent (HIGH-1)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      await room.storage.put("presenceWorkspaceId", "ws_1")
      const a = new FakeConnection()
      a.setState({ userId: "u_a" })
      room.registerConnection(a)

      let alarmAtWhenReportStarted: number | null = null
      reportWorkspacePresenceMock.mockImplementation(() => {
        alarmAtWhenReportStarted = room.storage.alarmAt
        return Promise.resolve()
      })

      await party.onAlarm()

      expect(alarmAtWhenReportStarted).not.toBeNull()
    })
  })

  /**
   * Re-bootstrap must not gate on `getAlarm() !== null`: that stays truthy
   * forever once scheduled, even if it silently stops firing. These tests set
   * up exactly that broken state and assert recovery via both `onConnect` and
   * `onRequest`, without relying on `getAlarm()`.
   */
  describe("self-healing a stalled report loop", () => {
    it("onConnect re-arms and re-reports when the freshness marker is stale, even though an alarm is still scheduled", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const staleMarkerAt = Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2
      await room.storage.setAlarm(Date.now() + PRESENCE_REPORT_INTERVAL_MS)
      await room.storage.put("presenceLastArmedAt", staleMarkerAt)

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", ["u_1"])
      expect(await room.storage.get("presenceLastArmedAt")).not.toBe(
        staleMarkerAt,
      )
    })

    it("onConnect re-arms when the freshness marker was never set (alarm scheduled by something that never recorded it)", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      await room.storage.setAlarm(Date.now() + PRESENCE_REPORT_INTERVAL_MS)

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
    })

    it("onConnect stays a no-op when the freshness marker is recent — no redundant re-bootstrap on a healthy loop", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const freshAlarmAt = Date.now() + PRESENCE_REPORT_INTERVAL_MS
      await room.storage.setAlarm(freshAlarmAt)
      await room.storage.put("presenceLastArmedAt", Date.now())

      await party.onConnect(
        new FakeConnection() as unknown as Party.Connection,
        connectionContext("u_1"),
      )

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
      expect(await room.storage.getAlarm()).toBe(freshAlarmAt)
    })

    it("avoids a storage read when the in-memory freshness marker is current", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()
      room.registerConnection(connection)

      await party.onConnect(
        connection as unknown as Party.Connection,
        connectionContext("u_1"),
      )
      const get = vi.spyOn(room.storage, "get")

      await party.onMessage(
        serializePresencePingMessage(),
        connection as unknown as Party.Connection,
      )

      expect(get).not.toHaveBeenCalled()
    })

    it("re-arms via a ping once the in-memory marker itself goes stale, on a warm instance with no intervening alarm tick", async () => {
      const room = new FakeRoom("ws_1")
      const party = new WorkspaceParty(room as unknown as Party.Room)
      const connection = new FakeConnection()
      room.registerConnection(connection)

      const nowSpy = vi.spyOn(Date, "now")
      const start = Date.now()
      nowSpy.mockReturnValue(start)

      await party.onConnect(
        connection as unknown as Party.Connection,
        connectionContext("u_1"),
      )
      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)

      // No onAlarm tick refreshes the marker in between: simulates a stalled
      // loop discovered only by the next client ping.
      nowSpy.mockReturnValue(start + PRESENCE_REPORT_INTERVAL_MS * 2)

      await party.onMessage(
        serializePresencePingMessage(),
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(2)
      expect(reportWorkspacePresenceMock).toHaveBeenLastCalledWith("ws_1", [
        "u_1",
      ])

      nowSpy.mockRestore()
    })
    it("onRequest self-heals a stalled loop for a room with a connection, without waiting for a new connect", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      await room.storage.setAlarm(Date.now() + PRESENCE_REPORT_INTERVAL_MS)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      const response = await party.onRequest(
        new Request("https://realtime.example.com/parties/workspaces/ws_1", {
          method: "POST",
          body: JSON.stringify({ eventType: "typing", data: {} }),
        }) as unknown as Party.Request,
      )

      expect(response.status).toBe(200)
      await vi.waitFor(() =>
        expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", [
          "u_1",
        ]),
      )
    })

    it("onRequest never arms anything for a room with zero connections, even when the freshness marker is stale", async () => {
      const room = new FakeRoom("ws_1")
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      const response = await party.onRequest(
        new Request("https://realtime.example.com/parties/workspaces/ws_1", {
          method: "POST",
          body: JSON.stringify({ eventType: "typing", data: {} }),
        }) as unknown as Party.Request,
      )

      expect(response.status).toBe(200)
      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
      expect(await room.storage.getAlarm()).toBeNull()
    })
  })

  /**
   * Codex release-blocker fix: a QUIET room (already-open tab, no new
   * connect, no inbound broadcast/onRequest) has neither of the other two
   * self-heal triggers. The client now pings over the already-open socket
   * every `PRESENCE_REPORT_INTERVAL_MS` (a presence keep-alive ping); this
   * is the party's THIRD independent recovery path for a stalled loop.
   */
  describe("onMessage (client keep-alive ping — the third self-heal trigger)", () => {
    it("re-arms and re-reports on a stale marker, with an open connection and NO new connect/onRequest", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      await room.storage.setAlarm(Date.now() + PRESENCE_REPORT_INTERVAL_MS)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onMessage(
        serializePresencePingMessage(),
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith("ws_1", ["u_1"])
    })

    it("is a no-op when the freshness marker is already fresh — no storage write, no report", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      const freshAlarmAt = Date.now() + PRESENCE_REPORT_INTERVAL_MS
      await room.storage.setAlarm(freshAlarmAt)
      const freshMarkerAt = Date.now()
      await room.storage.put("presenceLastArmedAt", freshMarkerAt)
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onMessage(
        serializePresencePingMessage(),
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
      expect(await room.storage.get("presenceLastArmedAt")).toBe(freshMarkerAt)
      expect(await room.storage.getAlarm()).toBe(freshAlarmAt)
    })

    it("ignores a malformed frame (not JSON)", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onMessage(
        "not json",
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
    })

    it("ignores an unknown/wrong-shape message type", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onMessage(
        JSON.stringify({ type: "someOtherMessage" }),
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
    })

    it("does nothing for a ping from a connection with no authenticated/tagged state", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      // Deliberately never `setState` — mirrors a connection that never
      // completed `onConnect`'s verified-userId tagging.
      room.registerConnection(connection)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await party.onMessage(
        serializePresencePingMessage(),
        connection as unknown as Party.Connection,
      )

      expect(reportWorkspacePresenceMock).not.toHaveBeenCalled()
    })

    it("a ping storm causes at most one re-arm (freshness gate + serialized lock)", async () => {
      const room = new FakeRoom("ws_1")
      const connection = new FakeConnection()
      connection.setState({ userId: "u_1" })
      room.registerConnection(connection)
      await room.storage.put(
        "presenceLastArmedAt",
        Date.now() - PRESENCE_REPORT_INTERVAL_MS * 2,
      )
      const party = new WorkspaceParty(room as unknown as Party.Room)

      await Promise.all(
        Array.from({ length: 20 }, () =>
          party.onMessage(
            serializePresencePingMessage(),
            connection as unknown as Party.Connection,
          ),
        ),
      )

      expect(reportWorkspacePresenceMock).toHaveBeenCalledTimes(1)
    })
  })
})

describe("WorkspaceParty#onMessage subscribe control frame (B3)", () => {
  it("updates a v2 connection's subscribed topics", async () => {
    const room = new FakeRoom("ws_1")
    const party = new WorkspaceParty(room as unknown as Party.Room)
    const connection = new FakeConnection()
    connection.setState({ userId: "u_1", protocol: "v2", topics: [] })

    await party.onMessage(
      serializeRealtimeSubscriptionMessage(["chat", "voip"]),
      connection as unknown as Party.Connection,
    )

    expect(connection.state).toEqual({
      userId: "u_1",
      protocol: "v2",
      topics: ["chat", "voip"],
    })
  })

  it("de-duplicates repeated topics in one subscribe message", async () => {
    const room = new FakeRoom("ws_1")
    const party = new WorkspaceParty(room as unknown as Party.Room)
    const connection = new FakeConnection()
    connection.setState({ userId: "u_1", protocol: "v2", topics: [] })

    await party.onMessage(
      serializeRealtimeSubscriptionMessage(["chat", "chat", "voip"]),
      connection as unknown as Party.Connection,
    )

    expect(connection.state?.topics).toEqual(["chat", "voip"])
  })

  it("replaces the previous topic list rather than merging into it", async () => {
    const room = new FakeRoom("ws_1")
    const party = new WorkspaceParty(room as unknown as Party.Room)
    const connection = new FakeConnection()
    connection.setState({ userId: "u_1", protocol: "v2", topics: ["chat"] })

    await party.onMessage(
      serializeRealtimeSubscriptionMessage(["voip"]),
      connection as unknown as Party.Connection,
    )

    expect(connection.state?.topics).toEqual(["voip"])
  })

  it("ignores a subscribe frame from a v1 connection — v1 never filters by topic", async () => {
    const room = new FakeRoom("ws_1")
    const party = new WorkspaceParty(room as unknown as Party.Room)
    const connection = new FakeConnection()
    connection.setState({ userId: "u_1", protocol: "v1" })

    await party.onMessage(
      serializeRealtimeSubscriptionMessage(["chat"]),
      connection as unknown as Party.Connection,
    )

    expect(connection.state).toEqual({ userId: "u_1", protocol: "v1" })
  })

  it("ignores a subscribe frame from an unauthenticated connection", async () => {
    const room = new FakeRoom("ws_1")
    const party = new WorkspaceParty(room as unknown as Party.Room)
    const connection = new FakeConnection()

    await expect(
      party.onMessage(
        serializeRealtimeSubscriptionMessage(["chat"]),
        connection as unknown as Party.Connection,
      ),
    ).resolves.toBeUndefined()
    expect(connection.state).toBeNull()
  })
})
