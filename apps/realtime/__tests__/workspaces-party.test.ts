import {
  signMemberConnectToken,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import type * as Party from "partykit/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { SECRET } = vi.hoisted(() => ({ SECRET: "s".repeat(32) }))

vi.mock("../src/env", () => ({
  env: { REALTIME_BROADCAST_SECRET: SECRET },
}))

import WorkspaceParty from "../src/parties/workspaces"

class FakeConnection {
  sent: string[] = []
  closed: { code?: number; reason?: string } | null = null
  send(message: string) {
    this.sent.push(message)
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason }
  }
}

class FakeRoom {
  id: string
  broadcastCalls: string[] = []
  private readonly connectionsByTag = new Map<string, FakeConnection[]>()

  constructor(id: string) {
    this.id = id
  }

  registerTaggedConnection(tag: string, connection: FakeConnection) {
    const existing = this.connectionsByTag.get(tag) ?? []
    this.connectionsByTag.set(tag, [...existing, connection])
  }

  broadcast(message: string) {
    this.broadcastCalls.push(message)
  }

  getConnections(tag: string): FakeConnection[] {
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

  it("broadcasts to the whole room when no target userId is given (existing behavior unchanged)", async () => {
    const event = { eventType: "typing", data: { seconds: 1 } }

    const response = await party.onRequest(
      postRequest("/parties/workspaces/ws_1", event),
    )

    expect(response.status).toBe(200)
    expect(room.broadcastCalls).toEqual([JSON.stringify(event)])
    expect(connectionA1.sent).toEqual([])
    expect(connectionB1.sent).toEqual([])
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
})
