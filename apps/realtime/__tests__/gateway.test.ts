import net from "node:net"
import {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  REALTIME_CLOSE_CODE,
  REALTIME_TOKEN_PURPOSE,
  signGuestConnectToken,
  signMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { SignJWT } from "jose"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createRealtimeGateway, type RealtimeGateway } from "../src/gateway"
import { testGatewayOptions } from "./helpers/gateway-options"

const { reportWorkspacePresenceMock } = vi.hoisted(() => ({
  reportWorkspacePresenceMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/lib/presence-report", () => ({
  reportWorkspacePresence: reportWorkspacePresenceMock,
}))

const HTTP_STATUS_LINE_PATTERN = /^HTTP\/1\.1 (\d{3})/

const SECRET = "gateway-test-secret"

const signMemberToken = async (
  member: Omit<Parameters<typeof signMemberConnectToken>[0], "issuedAtMs">,
  secret: string,
): Promise<string> =>
  await signMemberConnectToken({ ...member, issuedAtMs: Date.now() }, secret)

const createFakeRedis = () => ({
  disconnect: vi.fn(),
  duplicate: () => {
    const { promise, resolve } = Promise.withResolvers<null>()
    return {
      call: vi.fn(() => promise),
      disconnect: vi.fn(() => resolve(null)),
    }
  },
  // Default "not revoked" — a real revoke marker is set via `set` and read
  // back here by `getRealtimeMemberRevokedKey`; `mockResolvedValue(null)`
  // matches Redis's own `GET` miss response.
  get: vi.fn().mockResolvedValue(null),
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

const signExpiredGuestToken = async (
  guestConversationId: string,
  workspaceId: string,
  secret: string,
): Promise<string> =>
  await new SignJWT({
    guestConversationId,
    purpose: REALTIME_TOKEN_PURPOSE.guestConnect,
    workspaceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(`guest:${guestConversationId}`)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 120)
    .sign(new TextEncoder().encode(secret))

/**
 * Mints a member-connect token with an explicit `iatMs` claim, independent
 * of when this call actually runs — the revoke-marker boundary tests need
 * exact control over the gap between a token's mint time and a revoke's
 * recorded time, which `signMemberConnectToken`'s own `Date.now()` call
 * doesn't expose.
 */
const signMemberTokenWithIatMs = async (
  workspaceId: string,
  userId: string,
  iatMs: number,
  secret: string,
): Promise<string> =>
  await new SignJWT({
    chatScope: "all",
    iatMs,
    purpose: REALTIME_TOKEN_PURPOSE.memberConnect,
    teamIds: [],
    userId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(`workspace:${workspaceId}`)
    .setExpirationTime("60s")
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
const startUpgrade = (port: number, path: string): Promise<net.Socket> => {
  const { promise, reject, resolve } = Promise.withResolvers<net.Socket>()
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
    resolve(socket)
  })
  socket.once("error", reject)
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
 * A genuine real-clock wait against the live uWS server's own real timers
 * (presence coalesce window, periodic re-report interval) — these can't be
 * driven deterministically with fake timers without also faking uWS's
 * native (non-JS) socket machinery, which would make the real sockets these
 * tests connect through unreliable too.
 */
const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}
const withTestGateway = async (
  options: Parameters<typeof createRealtimeGateway>[0],
  callback: (gateway: RealtimeGateway) => Promise<void>,
): Promise<void> => {
  const gateway = createRealtimeGateway(options)

  try {
    await callback(gateway)
  } finally {
    await gateway.close()
  }
}

describe("createRealtimeGateway (live)", () => {
  let gateway: RealtimeGateway | undefined

  afterEach(async () => {
    await gateway?.close()
    gateway = undefined
    reportWorkspacePresenceMock.mockClear()
  })

  test.each([
    {
      description: "a member token forged with the wrong secret",
      requestPath: async () =>
        `/rt/workspaces/ws-1?token=${await signMemberToken(
          { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
          "wrong-secret",
        )}`,
    },
    {
      description: "an expired member token",
      requestPath: async () =>
        `/rt/workspaces/ws-1?token=${await signExpiredMemberToken(
          "ws-1",
          SECRET,
        )}`,
    },
    {
      description: "a member token minted for a different workspace",
      requestPath: async () =>
        `/rt/workspaces/ws-1?token=${await signMemberToken(
          { chatScope: "all", userId: "user-1", workspaceId: "ws-other" },
          SECRET,
        )}`,
    },
    {
      description: "a forged guest token",
      requestPath: async () =>
        `/rt/guests/guest-1?token=${await signGuestConnectToken(
          { guestConversationId: "guest-1", workspaceId: "ws-1" },
          "wrong-secret",
        )}`,
    },
    {
      description: "an expired guest token",
      requestPath: async () =>
        `/rt/guests/guest-1?token=${await signExpiredGuestToken(
          "guest-1",
          "ws-1",
          SECRET,
        )}`,
    },
    {
      description: "a guest token minted for a different guest conversation",
      requestPath: async () =>
        `/rt/guests/ws-1:guest-a?token=${await signGuestConnectToken(
          {
            guestConversationId: "ws-other:guest-a",
            workspaceId: "ws-other",
          },
          SECRET,
        )}`,
    },
    {
      description: "a member-connect token used against the guest route",
      requestPath: async () =>
        `/rt/guests/ws-1?token=${await signMemberToken(
          { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
          SECRET,
        )}`,
    },
    {
      description: "a guest-connect token used against the member route",
      requestPath: async () =>
        `/rt/workspaces/ws-1?token=${await signGuestConnectToken(
          { guestConversationId: "ws-1:guest-a", workspaceId: "ws-1" },
          SECRET,
        )}`,
    },
  ])("returns 401 for $description", async ({ requestPath }) => {
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)

    const response = await requestUpgrade(port, await requestPath())

    expect(response.statusCode).toBe(401)
  })

  test.concurrent("caps a workspace's total guest connections across distinct guest conversation ids", async () => {
    // Regression for PR #1349 finding #5: `maxConnectionsPerGuest` only caps
    // one `guestConversationId`. Without a separate per-workspace guest cap,
    // one tenant's webchat can open unlimited *distinct* guest conversations
    // and exhaust the global `maxGuestConnections` pool for every other
    // tenant.
    await withTestGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxGuestConnectionsPerWorkspace: 1,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
      async (testGateway) => {
        const port = await testGateway.listen("127.0.0.1", 0)
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
        const closePromise = waitForClose(second)
        await waitForOpen(second)

        expect((await closePromise).code).toBe(REALTIME_CLOSE_CODE.overloaded)

        first.close()
        await waitForClose(first)
      },
    )
  })

  test("N+k parallel upgrades against the cap: exactly N succeed", async () => {
    // Regression for PR #1349 finding #3: the pending-upgrade count is
    // incremented synchronously next to the capacity check, before the
    // `await` that lets concurrent upgrades for the same key race past it —
    // without that, a burst of parallel connects would all read the same
    // pre-upgrade count and all pass, breaching the cap.
    const CAP = 3
    const EXTRA = 2
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxConnectionsPerWorkspace: CAP,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const url = `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`

    // Fires every connect in the same tick, with no await between
    // constructions, so every upgrade handler races through its own
    // `verifyMemberConnectToken`/revoke-marker awaits concurrently — this is
    // exactly the window the synchronous pending-count increment has to
    // stay correct across.
    const sockets = Array.from(
      { length: CAP + EXTRA },
      () => new WebSocket(url),
    )
    await Promise.all(sockets.map((socket) => waitForOpen(socket)))
    // Every admitted AND overloaded socket completes the WS handshake (the
    // overloaded close is written from inside `open`, after it already
    // fired) — `readyState` transitioning away from OPEN is the reliable
    // signal here, not necessarily a `close` event: an overloaded socket
    // closed this fast after its own `open` can leave the `close` event
    // itself unobserved in this test transport even though the server-sent
    // close frame did land (confirmed independently), so this asserts on
    // the settled connection count instead of racing a `close` event.
    await delay(300)
    const openCount = sockets.filter(
      (socket) => socket.readyState === WebSocket.OPEN,
    ).length
    const notOpenCount = sockets.filter(
      (socket) => socket.readyState !== WebSocket.OPEN,
    ).length
    expect(openCount).toBe(CAP)
    expect(notOpenCount).toBe(EXTRA)

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
    await Promise.all(
      sockets
        .filter((socket) => socket.readyState === WebSocket.OPEN)
        .map((socket) => waitForClose(socket)),
    )
  })

  test("releases a workspace's connection slot once its socket closes", async () => {
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxConnectionsPerWorkspace: 1,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
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
  test("releases a guest connection slot once its socket closes", async () => {
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxGuestConnectionsPerWorkspace: 1,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const firstToken = await signGuestConnectToken(
      { guestConversationId: "guest-1", workspaceId: "ws-1" },
      SECRET,
    )
    const first = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-1?token=${firstToken}`,
    )
    await waitForOpen(first)
    first.close()
    await waitForClose(first)

    const secondToken = await signGuestConnectToken(
      { guestConversationId: "guest-2", workspaceId: "ws-1" },
      SECRET,
    )
    const second = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-2?token=${secondToken}`,
    )
    await waitForOpen(second)
    await delay(50)

    expect(second.readyState).toBe(WebSocket.OPEN)

    second.close()
    await waitForClose(second)
  })
  test("releases a member pending-upgrade slot and stream reference when the request aborts during revoke recheck", async () => {
    const { promise: recheck, resolve: resolveRecheck } = Promise.withResolvers<
      string | null
    >()
    const { promise: recheckStarted, resolve: resolveRecheckStarted } =
      Promise.withResolvers<void>()
    let revokeChecks = 0
    const redis = createFakeRedis()
    redis.get.mockImplementation(async () => {
      revokeChecks += 1
      if (revokeChecks === 2) {
        resolveRecheckStarted()
        return await recheck
      }
      return null
    })
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxConnectionsPerWorkspace: 1,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const abortedRequest = await startUpgrade(
      port,
      `/rt/workspaces/ws-1?token=${token}`,
    )
    await recheckStarted
    abortedRequest.destroy()
    resolveRecheck(null)
    await delay(50)

    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}`,
    )
    await waitForOpen(socket)

    expect(socket.readyState).toBe(WebSocket.OPEN)

    socket.close()
    await waitForClose(socket)
  })

  test("releases a guest pending-upgrade slot and stream reference when the request aborts", async () => {
    const { promise: activation, resolve: resolveActivation } =
      Promise.withResolvers<unknown[]>()
    const { promise: activationStarted, resolve: resolveActivationStarted } =
      Promise.withResolvers<void>()
    const redis = createFakeRedis()
    redis.xrevrange.mockImplementationOnce(async () => {
      resolveActivationStarted()
      return await activation
    })
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        maxGuestConnectionsPerWorkspace: 1,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signGuestConnectToken(
      { guestConversationId: "guest-1", workspaceId: "ws-1" },
      SECRET,
    )
    const abortedRequest = await startUpgrade(
      port,
      `/rt/guests/guest-1?token=${token}`,
    )
    await activationStarted
    abortedRequest.destroy()
    resolveActivation([])
    await delay(50)

    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/guests/guest-1?token=${token}`,
    )
    await waitForOpen(socket)

    expect(socket.readyState).toBe(WebSocket.OPEN)

    socket.close()
    await waitForClose(socket)
  })

  test.each([
    "member",
    "guest",
  ] as const)("forces a $0 socket to reauth once its connection lifetime elapses", async (kind) => {
    gateway = createRealtimeGateway(
      testGatewayOptions({
        connectionLifetimeMs: 50,
        maxConnections: 10,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token =
      kind === "member"
        ? await signMemberToken(
            { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
            SECRET,
          )
        : await signGuestConnectToken(
            { guestConversationId: "guest-1", workspaceId: "ws-1" },
            SECRET,
          )
    const path =
      kind === "member"
        ? `/rt/workspaces/ws-1?token=${token}`
        : `/rt/guests/guest-1?token=${token}`
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    await waitForOpen(socket)

    expect(await waitForClose(socket)).toEqual({
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
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
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

  test.concurrent.each([
    ["malformed", "not-a-stream-id", "invalid-last-seq"],
    ["stale", "1-0", "replay-cursor-ahead"],
  ])("closes with resync for a $0 lastSeq", async (_description, lastSeq, reason) => {
    await withTestGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: createFakeRedis() as never,
        secret: SECRET,
      }),
      async (testGateway) => {
        const port = await testGateway.listen("127.0.0.1", 0)
        const token = await signMemberToken(
          { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
          SECRET,
        )
        const socket = new WebSocket(
          `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}&lastSeq=${lastSeq}`,
        )
        const closePromise = waitForClose(socket)

        await waitForOpen(socket)

        expect(await closePromise).toEqual({
          code: REALTIME_CLOSE_CODE.resync,
          reason,
        })
      },
    )
  })

  test("closes a workspace socket with resync when its recent-entry buffer has evicted unseen records", async () => {
    const workspaceId = "ws-recent-gap"
    const entries = Array.from({ length: 513 }, (_, index) => [
      `${index + 1}-0`,
      [
        "record",
        JSON.stringify({
          events: [{ data: {}, eventType: "messageCreated" }],
          kind: "workspace-events",
          workspaceId,
        }),
      ],
    ])
    const { promise: initialReplayRead, resolve: resolveInitialReplayRead } =
      Promise.withResolvers<unknown>()
    const { promise: idleRead, resolve: resolveIdleRead } =
      Promise.withResolvers<null>()
    let xrangeCalls = 0
    let xreadCalls = 0
    const redis = {
      ...createFakeRedis(),
      duplicate: () => ({
        call: vi.fn(async () => {
          xreadCalls += 1
          if (xreadCalls === 1) {
            resolveInitialReplayRead([])
            return [[getRealtimeStreamKey(workspaceId), entries]]
          }
          return await idleRead
        }),
        disconnect: vi.fn(() => resolveIdleRead(null)),
      }),
      xrange: vi.fn(async (...args: string[]) => {
        if (args[1] !== "-") {
          return []
        }
        xrangeCalls += 1
        if (xrangeCalls === 1) {
          return await initialReplayRead
        }
        return []
      }),
      xrevrange: vi.fn().mockResolvedValue([["0-0", []]]),
    }
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId },
      SECRET,
    )
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/${workspaceId}?token=${token}&lastSeq=0-0`,
    )
    const closePromise = waitForClose(socket)

    await waitForOpen(socket)
    const closeEvent = await closePromise

    expect(closeEvent).toEqual({
      code: REALTIME_CLOSE_CODE.resync,
      reason: "recent-entries-expired",
    })
  })

  test("rejects a connect whose token was minted before a revoke was recorded, even with no lastSeq to replay through", async () => {
    // Regression for PR #1349 round-4 finding #5: the revoke check used to
    // only run against entries *inside* the replayed window, so a connect
    // with no `lastSeq` at all (every connect after a 4002 resync, or a
    // brand-new tab) skipped it entirely — a still-unexpired pre-revoke
    // token could connect regardless.
    const redis = createFakeRedis()
    redis.get.mockResolvedValue(String(Date.now() + 60_000))
    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )

    const response = await requestUpgrade(
      port,
      `/rt/workspaces/ws-1?token=${token}`,
    )

    expect(response.statusCode).toBe(401)
  })

  describe("revoke-marker iatMs boundary", () => {
    // Regression for PR #1349 round-5 finding #2: comparing against the
    // JWT's own `iat` (floored to whole seconds by jose's `setIssuedAt()`)
    // could put it BEFORE a revoke that landed earlier in the same second,
    // rejecting a legitimate reconnect minted within that second. `iatMs`
    // carries the real millisecond mint time instead.

    test.each([
      {
        expectedStatus: 401,
        iatOffset: -1,
        marker: true,
        name: "a token minted before the revoke marker",
      },
      {
        expectedStatus: undefined,
        iatOffset: 0,
        marker: true,
        name: "a token minted exactly at the revoke marker",
      },
      {
        expectedStatus: undefined,
        iatOffset: 1,
        marker: true,
        name: "a token minted after the revoke marker",
      },
      {
        expectedStatus: undefined,
        iatOffset: 0,
        marker: false,
        name: "a token with no revoke marker",
      },
    ])("handles $name", async ({ expectedStatus, iatOffset, marker }) => {
      const revokedAt = Date.now()
      const redis = createFakeRedis()
      if (marker) {
        redis.get.mockResolvedValue(String(revokedAt))
      }
      gateway = createRealtimeGateway(
        testGatewayOptions({
          maxConnections: 10,
          redis: redis as never,
          secret: SECRET,
        }),
      )
      const port = await gateway.listen("127.0.0.1", 0)
      const token = await signMemberTokenWithIatMs(
        "ws-1",
        "user-1",
        revokedAt + iatOffset,
        SECRET,
      )
      const path = `/rt/workspaces/ws-1?token=${token}`
      if (expectedStatus) {
        expect((await requestUpgrade(port, path)).statusCode).toBe(
          expectedStatus,
        )
        return
      }
      const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`)
      await waitForOpen(socket)
      expect(socket.readyState).toBe(WebSocket.OPEN)

      socket.close()
      await waitForClose(socket)
    })
  })

  test.concurrent("forces a 4002 resync when replay drops an entry for this workspace, not just a metric bump", async () => {
    // Regression for PR #1349 round-4 finding #6: a reconnect whose replay
    // window contains a malformed entry for ITS OWN workspace used to open
    // normally with a silent, permanent gap — the live dispatch path only
    // resyncs sockets that were already connected when the record first
    // arrived, not one reconnecting now with an older `lastSeq`.
    const redis = createFakeRedis()
    const bogusRecord = JSON.stringify({
      kind: "bogus-kind",
      workspaceId: "ws-1",
    })
    redis.xrevrange
      .mockResolvedValueOnce([]) // activateWorkspace's getLatestStreamId
      .mockResolvedValueOnce([["2-0", []]]) // loadReplay's newest-entry check
    redis.xrange
      .mockResolvedValueOnce([["1-0", []]]) // oldest-entry check
      .mockResolvedValueOnce([["2-0", ["record", bogusRecord]]]) // replay page
      .mockResolvedValueOnce([["1-0", []]]) // post-loop oldest re-check

    await withTestGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: redis as never,
        secret: SECRET,
      }),
      async (testGateway) => {
        const port = await testGateway.listen("127.0.0.1", 0)
        const token = await signMemberToken(
          { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
          SECRET,
        )
        const socket = new WebSocket(
          `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token}&lastSeq=1-0`,
        )
        const closePromise = waitForClose(socket)
        await waitForOpen(socket)

        expect(await closePromise).toEqual({
          code: REALTIME_CLOSE_CODE.resync,
          reason: "replay-entries-dropped",
        })
      },
    )
  })

  test("closes an invalid-record-tainted shard's sockets only for workspaces hashed to that shard, leaving other shards' sockets open", async () => {
    // Regression for `resyncShard` (PR #1349 test gap): an invalid stream
    // record whose `workspaceId` couldn't even be recovered has no single
    // workspace to target, so `onInvalidRecord` falls back to resyncing
    // every LOCALLY-CONNECTED workspace that hashes to the same shard —
    // this must not over-reach into unrelated shards' connections.
    const ws1Shard = getRealtimeStreamShard("ws-1")
    const ws2Shard = getRealtimeStreamShard("ws-2")
    expect(ws1Shard).not.toBe(ws2Shard) // precondition: distinct shards

    let injectedRead: unknown[] | null = null
    const xreadMock = vi.fn().mockImplementation(async () => {
      if (injectedRead) {
        const toReturn = injectedRead
        injectedRead = null
        return toReturn
      }
      // Simulates `XREAD`'s real `BLOCK`-ms pacing: resolving instantly
      // here would spin the reader's idle poll loop as fast as the event
      // loop allows, and `vi.fn()` recording every one of those calls
      // exhausts memory within milliseconds (reproduced standalone: crashes
      // the process) — real Redis actually blocks, so this mock must too.
      await delay(20)
      return null
    })
    const redis = {
      ...createFakeRedis(),
      duplicate: () => ({ call: xreadMock, disconnect: vi.fn() }),
    }

    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token1 = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const token2 = await signMemberToken(
      { chatScope: "all", userId: "user-2", workspaceId: "ws-2" },
      SECRET,
    )
    const socket1 = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token1}`,
    )
    const socket2 = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-2?token=${token2}`,
    )
    await Promise.all([waitForOpen(socket1), waitForOpen(socket2)])

    // An entry on ws-1's shard stream key with no recoverable `workspaceId`
    // (unparseable JSON) — `onInvalidRecord` gets `workspaceId: undefined`
    // and must fall back to `resyncShard(ws1Shard, ...)`.
    injectedRead = [
      [getRealtimeStreamKey("ws-1"), [["2-0", ["record", "not-json"]]]],
    ]

    const closeEvent = await waitForClose(socket1)
    expect(closeEvent.code).toBe(REALTIME_CLOSE_CODE.resync)
    expect(closeEvent.reason).toBe("malformed-stream-record")

    // ws-2's shard was never touched — its socket must stay open.
    await delay(100)
    expect(socket2.readyState).toBe(WebSocket.OPEN)
    socket2.close()
  })

  test("resyncs every connected workspace, across every shard, once the stream reader recovers from an XREAD error", async () => {
    // Regression for `resyncAllWorkspaces` (PR #1349 test gap): the stream
    // reader's single Redis connection blocks on every active shard at
    // once, so one failed read leaves every active shard's cursor
    // potentially stale by an unknown amount — recovery must resync
    // EVERY connected workspace, not just one shard.
    const ws1Shard = getRealtimeStreamShard("ws-1")
    const ws2Shard = getRealtimeStreamShard("ws-2")
    expect(ws1Shard).not.toBe(ws2Shard) // precondition: distinct shards

    let failNextRead = false
    const xreadMock = vi.fn().mockImplementation(async () => {
      if (failNextRead) {
        failNextRead = false
        throw new Error("simulated XREAD failure")
      }
      // See the sibling shard-isolation test above: an idle mock that
      // resolves instantly spins the reader's poll loop fast enough to
      // crash the process via unbounded `vi.fn()` call recording.
      await delay(20)
      return null
    })
    const redis = {
      ...createFakeRedis(),
      duplicate: () => ({ call: xreadMock, disconnect: vi.fn() }),
    }

    gateway = createRealtimeGateway(
      testGatewayOptions({
        maxConnections: 10,
        redis: redis as never,
        secret: SECRET,
      }),
    )
    const port = await gateway.listen("127.0.0.1", 0)
    const token1 = await signMemberToken(
      { chatScope: "all", userId: "user-1", workspaceId: "ws-1" },
      SECRET,
    )
    const token2 = await signMemberToken(
      { chatScope: "all", userId: "user-2", workspaceId: "ws-2" },
      SECRET,
    )
    const socket1 = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-1?token=${token1}`,
    )
    const socket2 = new WebSocket(
      `ws://127.0.0.1:${port}/rt/workspaces/ws-2?token=${token2}`,
    )
    await Promise.all([waitForOpen(socket1), waitForOpen(socket2)])

    failNextRead = true

    const [closeEvent1, closeEvent2] = await Promise.all([
      waitForClose(socket1),
      waitForClose(socket2),
    ])
    expect(closeEvent1.code).toBe(REALTIME_CLOSE_CODE.resync)
    expect(closeEvent1.reason).toBe("stream-reader-recovered")
    expect(closeEvent2.code).toBe(REALTIME_CLOSE_CODE.resync)
    expect(closeEvent2.reason).toBe("stream-reader-recovered")
  })

  // These cover a criticality-9 test gap (PR #1349 round-4 review): nothing
  // previously exercised the gateway's local presence orchestration
  // (dedupe, last-close, coalescing, periodic re-report) end-to-end. Each
  // opens a real uWS server + real sockets and waits out the (fixed, not
  // configurable per-test) 1s coalesce window — like this file's other
  // live-integration tests, that's a genuine real-clock wait.
  const PRESENCE_TEST_TIMEOUT_MS = 45_000

  test(
    "presence: dedupes two tabs of the same user and coalesces a second user's connect into one report",
    async () => {
      // A short, test-only `presenceReportCoalesceMs` (instead of the real
      // 1000ms default) keeps this real-socket test fast and avoids the
      // resource-exhaustion flakiness a 1100ms real-clock wait hit when run
      // after many other real-socket "live" tests earlier in this file.
      gateway = createRealtimeGateway(
        testGatewayOptions({
          maxConnections: 10,
          presenceReportCoalesceMs: 30,
          redis: createFakeRedis() as never,
          secret: SECRET,
        }),
      )
      const port = await gateway.listen("127.0.0.1", 0)
      const tokenA = await signMemberToken(
        { chatScope: "all", userId: "user-a", workspaceId: "ws-presence-1" },
        SECRET,
      )
      const tokenB = await signMemberToken(
        { chatScope: "all", userId: "user-b", workspaceId: "ws-presence-1" },
        SECRET,
      )
      const url = `ws://127.0.0.1:${port}/rt/workspaces/ws-presence-1?token=${tokenA}`

      const firstTab = new WebSocket(url)
      await waitForOpen(firstTab)
      const secondTab = new WebSocket(url)
      await waitForOpen(secondTab)
      const otherUser = new WebSocket(
        `ws://127.0.0.1:${port}/rt/workspaces/ws-presence-1?token=${tokenB}`,
      )
      await waitForOpen(otherUser)

      await delay(150) // past the 30ms presence-report coalesce window

      const callsForWorkspace = reportWorkspacePresenceMock.mock.calls.filter(
        ([workspaceId]) => workspaceId === "ws-presence-1",
      )
      expect(callsForWorkspace).toHaveLength(1)
      expect(callsForWorkspace[0]?.[1]).toEqual(
        expect.arrayContaining(["user-a", "user-b"]),
      )
      expect(callsForWorkspace[0]?.[1]).toHaveLength(2)

      // Closing 3 sockets this close together can leave a `close` event
      // unobserved client-side even once the server has written its close
      // frame (the same transport quirk the N+k parallel-upgrades test
      // works around) — `gateway.close()` in `afterEach` tears down
      // whatever's left, so cleanup here doesn't need to wait on it.
      firstTab.close()
      secondTab.close()
      otherUser.close()
    },
    PRESENCE_TEST_TIMEOUT_MS,
  )

  test(
    "presence: reports empty presence when the last tab closes, not just silence",
    async () => {
      gateway = createRealtimeGateway(
        testGatewayOptions({
          maxConnections: 10,
          presenceReportCoalesceMs: 30,
          presenceReportIntervalMs: 50,
          redis: createFakeRedis() as never,
          secret: SECRET,
        }),
      )
      const port = await gateway.listen("127.0.0.1", 0)
      const token = await signMemberToken(
        { chatScope: "all", userId: "user-1", workspaceId: "ws-presence-2" },
        SECRET,
      )
      const socket = new WebSocket(
        `ws://127.0.0.1:${port}/rt/workspaces/ws-presence-2?token=${token}`,
      )
      await waitForOpen(socket)
      await delay(150)
      const connectedCalls = reportWorkspacePresenceMock.mock.calls.filter(
        ([workspaceId]) => workspaceId === "ws-presence-2",
      )
      expect(connectedCalls.length).toBeGreaterThanOrEqual(2)
      expect(connectedCalls[0]?.[1]).toEqual(["user-1"])
      reportWorkspacePresenceMock.mockClear()

      socket.close()
      await waitForClose(socket)
      await delay(150)

      expect(reportWorkspacePresenceMock).toHaveBeenCalledWith(
        "ws-presence-2",
        [],
        "http://builder.test",
        SECRET,
      )
    },
    PRESENCE_TEST_TIMEOUT_MS,
  )
})
