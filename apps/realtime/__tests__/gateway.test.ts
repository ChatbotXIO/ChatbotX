import net from "node:net"
import {
  REALTIME_CLOSE_CODE,
  REALTIME_TOKEN_PURPOSE,
  signGuestConnectToken,
  signMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { SignJWT } from "jose"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createRealtimeGateway,
  loadReplay,
  type RealtimeGateway,
} from "../src/gateway"

const HTTP_STATUS_LINE_PATTERN = /^HTTP\/1\.1 (\d{3})/

describe("loadReplay", () => {
  test("requires resync for a cursor ahead of the retained stream tail", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([["10-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["10-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "11-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-cursor-ahead",
      entries: [],
    })
    expect(redis.xrange).toHaveBeenCalledTimes(1)
    expect(redis.xrevrange).toHaveBeenCalledTimes(1)
  })

  test("requires resync for a nonzero cursor when the stream was reset", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([]),
      xrevrange: vi.fn().mockResolvedValue([]),
    }

    const replay = await loadReplay({
      lastSeq: "10-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-cursor-ahead",
      entries: [],
    })
  })

  test("requires resync when trimming advances the replay head", async () => {
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["5-0", []]])
        .mockResolvedValueOnce([["10-0", []]])
        .mockResolvedValueOnce([["10-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["10-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "5-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-expired",
      entries: [],
    })
    expect(redis.xrange).toHaveBeenCalledTimes(3)
  })

  test("requires resync when the cursor-less sentinel is sent against a stream with retained history", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([["5-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["5-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "0-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay).toEqual({
      closeReason: "replay-window-expired",
      entries: [],
    })
  })

  test("does not resync the cursor-less sentinel against a genuinely empty stream", async () => {
    const redis = {
      xrange: vi.fn().mockResolvedValue([]),
      xrevrange: vi.fn().mockResolvedValue([]),
    }

    const replay = await loadReplay({
      lastSeq: "0-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.closeReason).toBeUndefined()
    expect(replay.entries).toEqual([])
  })

  test("reports droppedCount for an entry that fails to parse entirely", async () => {
    // Regression for PR #1349 finding #7: the live dispatch path signals a
    // dropped entry via onInvalidRecord/counters.malformedRecords, but the
    // replay path used to just log + continue with no visibility at all.
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]])
        .mockResolvedValueOnce([["2-0", ["record", "not-json"]]])
        .mockResolvedValueOnce([["1-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["2-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.entries).toEqual([])
    expect(replay.droppedCount).toBe(1)
  })

  test("reports droppedCount for a partially-invalid coalesced record, while still returning its valid events", async () => {
    const workspaceEventsRecord = JSON.stringify({
      events: [
        { data: { id: "ok" }, eventType: "messageCreated" },
        { data: {}, eventType: 123 },
      ],
      kind: "workspace-events",
      workspaceId: "workspace-1",
    })
    const redis = {
      xrange: vi
        .fn()
        .mockResolvedValueOnce([["1-0", []]])
        .mockResolvedValueOnce([["2-0", ["record", workspaceEventsRecord]]])
        .mockResolvedValueOnce([["1-0", []]]),
      xrevrange: vi.fn().mockResolvedValue([["2-0", []]]),
    }

    const replay = await loadReplay({
      lastSeq: "1-0",
      redis: redis as never,
      workspaceId: "workspace-1",
    })

    expect(replay.entries).toEqual([
      {
        id: "2-0",
        record: {
          events: [{ data: { id: "ok" }, eventType: "messageCreated" }],
          kind: "workspace-events",
          workspaceId: "workspace-1",
        },
      },
    ])
    expect(replay.droppedCount).toBe(1)
  })
})

const SECRET = "gateway-test-secret"

// `createStreamReader` only touches `redis.duplicate()`/`.call()` once a
// workspace is activated and its XREAD poll loop runs; none of the tests
// below activate a workspace (auth rejections return before that point, and
// the capacity tests close sockets within the same poll tick), so this fake
// never needs to answer XREAD.
const createFakeRedis = () => ({
  disconnect: vi.fn(),
  duplicate: () => ({ disconnect: vi.fn() }),
  xrange: vi.fn().mockResolvedValue([]),
  xrevrange: vi.fn().mockResolvedValue([]),
})

const signExpiredMemberToken = async (
  workspaceId: string,
  secret: string,
): Promise<string> =>
  await new SignJWT({
    chatScope: "all",
    purpose: REALTIME_TOKEN_PURPOSE.memberConnect,
    teamIds: [],
    userId: "user-1",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(`workspace:${workspaceId}`)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 120)
    .sign(new TextEncoder().encode(secret))

/**
 * Sends a literal WebSocket upgrade request over a raw socket and resolves
 * with the response status line, without completing the handshake. A real
 * `WebSocket` client hides the rejecting response's status code entirely
 * (its `error` event carries no detail), so asserting the gateway's upgrade
 * handler actually wrote "401 Unauthorized" (vs., say, hanging or dropping
 * the connection) requires reading the raw HTTP response ourselves.
 */
const requestUpgrade = (
  port: number,
  path: string,
): Promise<{ statusCode: number }> => {
  const { promise, resolve, reject } = Promise.withResolvers<{
    statusCode: number
  }>()
  const socket = net.connect(port, "127.0.0.1", () => {
    socket.write(
      [
        `GET ${path} HTTP/1.1`,
        "Host: 127.0.0.1",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    )
  })
  let buffer = ""
  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    if (!buffer.includes("\r\n\r\n")) {
      return
    }
    const statusLine = buffer.slice(0, buffer.indexOf("\r\n"))
    const match = HTTP_STATUS_LINE_PATTERN.exec(statusLine)
    socket.destroy()
    if (!match?.[1]) {
      reject(new Error(`Unexpected status line: ${statusLine}`))
      return
    }
    resolve({ statusCode: Number(match[1]) })
  })
  socket.on("error", reject)
  return promise
}

const waitForOpen = (socket: WebSocket): Promise<void> => {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  socket.onopen = () => resolve()
  socket.onerror = () => reject(new Error("socket errored before opening"))
  return promise
}

const waitForClose = (
  socket: WebSocket,
): Promise<{ code: number; reason: string }> => {
  const { promise, resolve } = Promise.withResolvers<{
    code: number
    reason: string
  }>()
  socket.onclose = (event) =>
    resolve({ code: event.code, reason: event.reason })
  return promise
}

const waitForMessage = (socket: WebSocket): Promise<string> => {
  const { promise, resolve } = Promise.withResolvers<string>()
  socket.onmessage = (event) => resolve(event.data as string)
  return promise
}

/**
 * A genuine real-clock wait — see the one call site below for why this
 * can't be driven deterministically instead (live uWS server, real sockets).
 */
const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

describe("createRealtimeGateway (live)", () => {
  let gateway: RealtimeGateway | undefined

  afterEach(async () => {
    await gateway?.close()
    gateway = undefined
  })

  test("returns 401 for a member token forged with the wrong secret", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const forgedToken = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      "wrong-secret",
    )

    const response = await requestUpgrade(
      port,
      `/rt/workspaces/ws-1?token=${forgedToken}`,
    )

    expect(response.statusCode).toBe(401)
  })

  test("returns 401 for an expired member token", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const expiredToken = await signExpiredMemberToken("ws-1", SECRET)

    const response = await requestUpgrade(
      port,
      `/rt/workspaces/ws-1?token=${expiredToken}`,
    )

    expect(response.statusCode).toBe(401)
  })

  test("returns 401 for a member token minted for a different workspace", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const tokenForOtherWorkspace = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-other" },
      SECRET,
    )

    const response = await requestUpgrade(
      port,
      `/rt/workspaces/ws-1?token=${tokenForOtherWorkspace}`,
    )

    expect(response.statusCode).toBe(401)
  })

  test("returns 401 for a forged guest token", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const forgedToken = await signGuestConnectToken(
      { guestConversationId: "guest-1", workspaceId: "ws-1" },
      "wrong-secret",
    )

    const response = await requestUpgrade(
      port,
      `/rt/guests/guest-1?token=${forgedToken}`,
    )

    expect(response.statusCode).toBe(401)
  })

  test("caps a workspace's total guest connections across distinct guest conversation ids", async () => {
    // Regression for PR #1349 finding #5: `maxConnectionsPerGuest` only caps
    // one `guestConversationId`. Without a separate per-workspace guest cap,
    // one tenant's webchat can open unlimited *distinct* guest conversations
    // and exhaust the global `maxGuestConnections` pool for every other
    // tenant.
    gateway = createRealtimeGateway({
      maxConnections: 10,
      maxGuestConnectionsPerWorkspace: 1,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const tokenA = await signGuestConnectToken(
      { guestConversationId: "guest-a", workspaceId: "ws-1" },
      SECRET,
    )
    const tokenB = await signGuestConnectToken(
      { guestConversationId: "guest-b", workspaceId: "ws-1" },
      SECRET,
    )

    const first = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-a?token=${tokenA}`,
    )
    await waitForOpen(first)

    const second = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-b?token=${tokenB}`,
    )
    await waitForOpen(second)
    const closeEvent = await waitForClose(second)
    expect(closeEvent.code).toBe(REALTIME_CLOSE_CODE.overloaded)

    first.close()
    await waitForClose(first)
  })

  test("rejects a workspace's second connection as overloaded while the first still holds the slot", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      maxConnectionsPerWorkspace: 1,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const url = `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`

    const first = new WebSocket(url)
    await waitForOpen(first)

    const second = new WebSocket(url)
    await waitForOpen(second)
    const closeEvent = await waitForClose(second)
    expect(closeEvent.code).toBe(REALTIME_CLOSE_CODE.overloaded)

    first.close()
    await waitForClose(first)
  })

  test("releases a workspace's connection slot once its socket closes", async () => {
    gateway = createRealtimeGateway({
      maxConnections: 10,
      maxConnectionsPerWorkspace: 1,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const url = `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`

    const first = new WebSocket(url)
    await waitForOpen(first)
    first.close()
    await waitForClose(first)

    // If the first connection's slot weren't released on close, this second
    // connection would be rejected as overloaded (maxConnectionsPerWorkspace
    // is 1) and close with REALTIME_CLOSE_CODE.overloaded almost
    // immediately. There is no deterministic event to await instead of a
    // short real delay here: this is a live uWS server over a real TCP
    // socket, not driven by vitest's fake timers, and "no close frame
    // arrived" is an absence, not a signal `waitForClose` can resolve on.
    const second = new WebSocket(url)
    await waitForOpen(second)
    await delay(50)
    expect(second.readyState).toBe(WebSocket.OPEN)

    second.close()
    await waitForClose(second)
  })

  test("forces a member socket to reauth (not resync) once its connection lifetime elapses", async () => {
    // Regression for PR #1349 finding #2: the lifetime close used to reuse
    // the `resync` code, forcing every tab through a full cache invalidation
    // every `connectionLifetimeMs` even though nothing was actually lost.
    gateway = createRealtimeGateway({
      connectionLifetimeMs: 50,
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`,
    )
    await waitForOpen(socket)

    const closeEvent = await waitForClose(socket)
    expect(closeEvent).toEqual({
      code: REALTIME_CLOSE_CODE.reauth,
      reason: "connection-lifetime-exceeded",
    })
  })

  test("forces a guest socket to reauth (not resync) once its connection lifetime elapses", async () => {
    gateway = createRealtimeGateway({
      connectionLifetimeMs: 50,
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signGuestConnectToken(
      { guestConversationId: "guest-1", workspaceId: "ws-1" },
      SECRET,
    )
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-1?token=${token}`,
    )
    await waitForOpen(socket)

    const closeEvent = await waitForClose(socket)
    expect(closeEvent).toEqual({
      code: REALTIME_CLOSE_CODE.reauth,
      reason: "connection-lifetime-exceeded",
    })
  })

  test("sends an open-time cursor frame even when nothing was replayed", async () => {
    // Regression for PR #1349 finding #2: a reconnect that never processed a
    // live batch had no cursor of its own, so it fell back to a synthetic
    // "0-0" lastSeq on its *next* reconnect — which always resyncs
    // (replay-window-expired) against a non-empty stream, forcing a full
    // cache invalidation on every quiet-tab lifetime rotation. Sending this
    // cursor up front on every open means a connection always has a real
    // one, even if it never receives a single live batch.
    gateway = createRealtimeGateway({
      maxConnections: 10,
      redis: createFakeRedis() as never,
      secret: SECRET,
    })
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberConnectToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`,
    )
    await waitForOpen(socket)

    const frame = await waitForMessage(socket)

    expect(JSON.parse(frame)).toEqual({ batch: [], seq: "0-0" })

    socket.close()
    await waitForClose(socket)
  })
})
