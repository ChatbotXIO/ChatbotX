import type { HttpRequest } from "uWebSockets.js"
import { REALTIME_CLOSE_CODE } from "@chatbotx.io/realtime-protocol"
import { decrementKeyedCount, incrementKeyedCount } from "./lib/keyed-count"

export const OVERLOAD_RETRY_AFTER_MIN_MS = 1000
export const OVERLOAD_RETRY_AFTER_SPREAD_MS = 4000

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
  // Pending (not-yet-open) upgrades per key, incremented synchronously next
  // to the capacity check and before the `await` that lets concurrent
  // upgrades for the same key race past it — without this, a burst of
  // parallel connects all read the same pre-upgrade count and all pass.
  // See PR #1349 finding #3.
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

/** One keyed counter to move in lockstep with its siblings — see
 * `acquireSlot`/`releaseSlot`. */
export type KeyedSlot = { key: string; map: Map<string, number> }

/** Increments every keyed counter in `slots` together — used when a pending
 * upgrade is admitted, so a per-key/per-workspace pending count never drifts
 * out of lockstep with its sibling counters (e.g. a guest connect's
 * per-guest-conversation AND per-workspace pending counts). */
export const acquireSlot = (slots: KeyedSlot[]): void => {
  for (const slot of slots) {
    incrementKeyedCount(slot.map, slot.key)
  }
}

/** Decrements every keyed counter in `slots` together — the inverse of
 * `acquireSlot`, used whether the slot is released before ever opening
 * (abort/error) or promoted to (and later released from) the active set. */
export const releaseSlot = (slots: KeyedSlot[]): void => {
  for (const slot of slots) {
    decrementKeyedCount(slot.map, slot.key)
  }
}

/** The handful of upgrade-request headers uWS needs verbatim to complete
 * `res.upgrade(...)` — read once per connect by both the workspace and
 * guest upgrade handlers. */
export type UpgradeRequestHeaders = {
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

/** Minimal socket shape `armLifetimeTimer` needs — satisfied by both
 * `WorkspaceSocket` and `GuestSocket`. */
type LifetimeSocket = {
  end: (code?: number, reason?: string) => void
}

/** Minimal per-socket data shape `armLifetimeTimer` needs — satisfied by
 * both `WorkspaceSocketData` and `GuestSocketData`. */
type LifetimeSocketData = {
  closed: boolean
}

/**
 * Forces every connection to periodically re-handshake (fresh token mint,
 * re-checked membership/permissions) instead of living forever once open —
 * the only way a revoked member, a disabled support-access session, or an
 * expired grant stops receiving events short of an explicit revoke event.
 * Shared by the workspace and guest socket `open` handlers.
 */
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
