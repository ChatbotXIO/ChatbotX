import type {
  HttpRequest,
  HttpResponse,
  us_socket_context_t,
  WebSocketBehavior,
} from "uWebSockets.js"
import { SHARED_COMPRESSOR } from "uWebSockets.js"
import {
  isRealtimeSeqAfter,
  REALTIME_CLOSE_CODE,
} from "@chatbotx.io/realtime-protocol"
import { decrementKeyedCount, incrementKeyedCount } from "./lib/keyed-count"
import type { StreamReader } from "./stream-reader"

const OVERLOAD_RETRY_AFTER_MIN_MS = 1000
const OVERLOAD_RETRY_AFTER_SPREAD_MS = 4000
const SLOW_CONSUMER_BUFFER_BYTES = 512_000

export const baseBehavior = {
  closeOnBackpressureLimit: true,
  compression: SHARED_COMPRESSOR,
  idleTimeout: 60,
  maxBackpressure: SLOW_CONSUMER_BUFFER_BYTES,
  sendPingsAutomatically: true,
} satisfies Pick<
  WebSocketBehavior<object>,
  | "closeOnBackpressureLimit"
  | "compression"
  | "idleTimeout"
  | "maxBackpressure"
  | "sendPingsAutomatically"
>

/**
 * Jittered retry hint for an overloaded connection. The spread keeps a mass
 * reconnect from re-arriving in lockstep; the client uses this value verbatim.
 */
export const nextOverloadRetryAfterMs = (): number =>
  OVERLOAD_RETRY_AFTER_MIN_MS +
  Math.floor(Math.random() * OVERLOAD_RETRY_AFTER_SPREAD_MS)

/**
 * Mutable connection-admission counters and keyed bookkeeping shared between
 * `gateway.ts` (which reads them for `close`/`flushMetrics`/`listen`) and the
 * workspace/guest socket handler factories (which read AND mutate them on
 * every upgrade/open/close). Passed by reference — every holder shares the
 * same object instance, so a mutation in one file is visible everywhere.
 */
export type GatewayConnectionState<
  WorkspaceSocketData extends object,
  GuestSocketData extends object,
> = {
  activeConnections: number
  activeGuestConnections: number
  guestConnectionCountByKey: Map<string, number>
  guestConnectionCountByWorkspace: Map<string, number>
  guestLifetimeTimers: WeakMap<GuestSocketData, NodeJS.Timeout>
  guestPendingUpgradesByKey: Map<string, number>
  guestPendingUpgradesByWorkspace: Map<string, number>
  memberConnectionCountByWorkspace: Map<string, number>
  memberPendingUpgradesByWorkspace: Map<string, number>
  peakConnections: number
  pendingGuestUpgrades: number
  pendingUpgrades: number
  workspaceLifetimeTimers: WeakMap<WorkspaceSocketData, NodeJS.Timeout>
}

export const createGatewayConnectionState = <
  WorkspaceSocketData extends object,
  GuestSocketData extends object,
>(): GatewayConnectionState<WorkspaceSocketData, GuestSocketData> => ({
  activeConnections: 0,
  activeGuestConnections: 0,
  guestConnectionCountByKey: new Map(),
  guestConnectionCountByWorkspace: new Map(),
  guestLifetimeTimers: new WeakMap(),
  guestPendingUpgradesByKey: new Map(),
  guestPendingUpgradesByWorkspace: new Map(),
  memberConnectionCountByWorkspace: new Map(),
  memberPendingUpgradesByWorkspace: new Map(),
  peakConnections: 0,
  pendingGuestUpgrades: 0,
  pendingUpgrades: 0,
  workspaceLifetimeTimers: new WeakMap(),
})

type KeyedSlot = { key: string; map: Map<string, number> }

export const acquireSlot = (slots: KeyedSlot[]): void => {
  for (const slot of slots) {
    incrementKeyedCount(slot.map, slot.key)
  }
}

export const releaseSlot = (slots: KeyedSlot[]): void => {
  for (const slot of slots) {
    decrementKeyedCount(slot.map, slot.key)
  }
}

export type PendingUpgrade = { release: () => void }

export const createPendingUpgrade = <
  WorkspaceSocketData extends object,
  GuestSocketData extends object,
>(
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>,
  slots: KeyedSlot[],
  isGuest = false,
): PendingUpgrade => {
  state.pendingUpgrades += 1
  if (isGuest) {
    state.pendingGuestUpgrades += 1
  }
  acquireSlot(slots)
  let released = false

  return {
    release: () => {
      if (released) {
        return
      }
      released = true
      state.pendingUpgrades -= 1
      if (isGuest) {
        state.pendingGuestUpgrades -= 1
      }
      releaseSlot(slots)
    },
  }
}

type UpgradeRequestHeaders = {
  websocketExtensions: string
  websocketKey: string
  websocketProtocol: string
}

export const readUpgradeRequest = (
  req: HttpRequest,
): UpgradeRequestHeaders => ({
  websocketExtensions: req.getHeader("sec-websocket-extensions"),
  websocketKey: req.getHeader("sec-websocket-key"),
  websocketProtocol: req.getHeader("sec-websocket-protocol"),
})

export const upgradeSocket = <SocketData extends object>({
  context,
  headers,
  res,
  socketData,
}: {
  context: us_socket_context_t
  headers: UpgradeRequestHeaders
  res: HttpResponse
  socketData: SocketData
}): void => {
  res.cork(() => {
    res.upgrade(
      socketData,
      headers.websocketKey,
      headers.websocketProtocol,
      headers.websocketExtensions,
      context,
    )
  })
}

export const writeStatus = (res: HttpResponse, status: string): void => {
  res.cork(() => {
    res.writeStatus(status).end()
  })
}

export const writeUnauthorized = (res: HttpResponse): void => {
  writeStatus(res, "401 Unauthorized")
}

export const verifyConnectToken = async <Claims>({
  aborted,
  counters,
  logTokenRejection,
  rejectionContext,
  res,
  verify,
}: {
  aborted: () => boolean
  counters: { tokenRejections: number }
  logTokenRejection: (context: Record<string, unknown>, error: unknown) => void
  rejectionContext: Record<string, unknown>
  res: HttpResponse
  verify: () => Promise<Claims>
}): Promise<Claims | undefined> => {
  try {
    return await verify()
  } catch (error) {
    if (!aborted()) {
      counters.tokenRejections += 1
      logTokenRejection(rejectionContext, error)
      writeUnauthorized(res)
    }
    return
  }
}

export const upgradeAsOverloaded = <
  WorkspaceSocketData extends object,
  GuestSocketData extends object,
  SocketData extends { closed: boolean; pendingUpgrade?: PendingUpgrade },
>({
  aborted,
  context,
  isGuest = false,
  requestHeaders,
  res,
  socketData,
  state,
}: {
  aborted: boolean
  context: us_socket_context_t
  isGuest?: boolean
  requestHeaders: UpgradeRequestHeaders
  res: HttpResponse
  socketData: SocketData
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>
}): void => {
  if (aborted) {
    return
  }
  const pendingUpgrade = createPendingUpgrade(state, [], isGuest)
  try {
    upgradeSocket({
      context,
      headers: requestHeaders,
      res,
      socketData: { ...socketData, pendingUpgrade },
    })
  } catch (error) {
    pendingUpgrade.release()
    throw error
  }
}

export const closeIfOverloadedOnOpen = <
  WorkspaceSocketData extends object,
  GuestSocketData extends object,
  SocketData extends {
    closed: boolean
    overloadRetryAfterMs?: number
    pendingUpgrade?: PendingUpgrade
  },
  Socket extends { end: (code?: number, reason?: string) => void },
>({
  counters,
  onAccepted,
  socket,
  socketData,
  state,
}: {
  counters: { overloadCloses: number }
  onAccepted?: () => void
  socket: Socket
  socketData: SocketData
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>
}): boolean => {
  socketData.pendingUpgrade?.release()
  if (socketData.overloadRetryAfterMs !== undefined) {
    counters.overloadCloses += 1
    socketData.closed = true
    socket.end(
      REALTIME_CLOSE_CODE.overloaded,
      JSON.stringify({ retryAfter: socketData.overloadRetryAfterMs }),
    )
    return true
  }
  state.activeConnections += 1
  state.peakConnections = Math.max(
    state.peakConnections,
    state.activeConnections,
  )
  onAccepted?.()
  return false
}

export const closeIfTainted = ({
  socket,
  socketData,
  streamReader,
}: {
  socket: { end: (code?: number, reason?: string) => void }
  socketData: { closed: boolean; replayCutoff?: string; workspaceId: string }
  streamReader: Pick<StreamReader, "getTaintedUpToId">
}): boolean => {
  const taintedUpToId = streamReader.getTaintedUpToId(socketData.workspaceId)
  if (
    !taintedUpToId ||
    (socketData.replayCutoff &&
      !isRealtimeSeqAfter(taintedUpToId, socketData.replayCutoff))
  ) {
    return false
  }
  socketData.closed = true
  socket.end(REALTIME_CLOSE_CODE.resync, "malformed-stream-record")
  return true
}

/** Minimal socket shape `armLifetimeTimer` needs — satisfied by both socket types. */
type LifetimeSocket = {
  end: (code?: number, reason?: string) => void
}

type LifetimeSocketData = {
  closed: boolean
}

export const armLifetimeTimer = <
  SocketData extends LifetimeSocketData,
  Socket extends LifetimeSocket,
>(
  timers: WeakMap<SocketData, NodeJS.Timeout>,
  socketData: SocketData,
  socket: Socket,
  lifetimeMs: number,
): void => {
  timers.set(
    socketData,
    setTimeout(() => {
      if (socketData.closed) {
        return
      }
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.reauth, "connection-lifetime-exceeded")
    }, lifetimeMs),
  )
}

export const clearLifetimeTimer = <SocketData extends object>(
  timers: WeakMap<SocketData, NodeJS.Timeout>,
  socketData: SocketData,
): void => {
  clearTimeout(timers.get(socketData))
  timers.delete(socketData)
}
