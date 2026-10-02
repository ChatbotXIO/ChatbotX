import type { WebSocketBehavior } from "uWebSockets.js"
import {
  isRealtimeSeqAfter,
  REALTIME_CLOSE_CODE,
  type RealtimeGuestClaims,
  verifyGuestConnectToken,
} from "@chatbotx.io/realtime-protocol"
import type { GuestSocketData, RealtimeDelivery } from "./delivery"
import {
  acquireSlot,
  armLifetimeTimer,
  type GatewayConnectionState,
  nextOverloadRetryAfterMs,
  readUpgradeRequest,
  releaseSlot,
} from "./gateway-shared"
import type { RealtimeServerCounters } from "./lib/realtime-metrics"
import { logger } from "./logger"
import type { StreamReader } from "./stream-reader"

const SLOW_CONSUMER_BUFFER_BYTES = 512_000

const guestConnectionKey = (
  workspaceId: string,
  guestConversationId: string,
): string => `${workspaceId}:${guestConversationId}`

export type GuestSocketDeps<WorkspaceSocketData extends object> = {
  counters: RealtimeServerCounters
  delivery: RealtimeDelivery
  jitteredConnectionLifetimeMs: () => number
  logTokenRejection: (context: Record<string, unknown>, error: unknown) => void
  maxConnections: number
  maxConnectionsPerGuest: number
  maxGuestConnections: number
  maxGuestConnectionsPerWorkspace: number
  secret: string
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>
  streamReader: StreamReader
}

export const createGuestSocketBehavior = <WorkspaceSocketData extends object>({
  counters,
  delivery,
  jitteredConnectionLifetimeMs,
  logTokenRejection,
  maxConnections,
  maxConnectionsPerGuest,
  maxGuestConnections,
  maxGuestConnectionsPerWorkspace,
  secret,
  state,
  streamReader,
}: GuestSocketDeps<WorkspaceSocketData>): WebSocketBehavior<GuestSocketData> => ({
  closeOnBackpressureLimit: true,
  idleTimeout: 60,
  maxBackpressure: SLOW_CONSUMER_BUFFER_BYTES,
  sendPingsAutomatically: true,
  upgrade: (res, req, context) => {
    let aborted = false
    res.onAborted(() => {
      aborted = true
    })
    const guestConversationId = req.getParameter("guestConversationId")
    const token = req.getQuery("token")
    const { websocketExtensions, websocketKey, websocketProtocol } =
      readUpgradeRequest(req)
    if (!(guestConversationId && token)) {
      counters.tokenRejections += 1
      res.cork(() => {
        res.writeStatus("401 Unauthorized").end()
      })
      return
    }

    ;(async () => {
      let claims: RealtimeGuestClaims
      try {
        claims = await verifyGuestConnectToken(
          token,
          guestConversationId,
          secret,
        )
      } catch (error) {
        if (!aborted) {
          counters.tokenRejections += 1
          logTokenRejection({ guestConversationId }, error)
          res.cork(() => {
            res.writeStatus("401 Unauthorized").end()
          })
        }
        return
      }

      const guestKey = guestConnectionKey(
        claims.workspaceId,
        guestConversationId,
      )
      const guestConnectionCount =
        state.guestConnectionCountByKey.get(guestKey) ?? 0
      const guestPendingCount =
        state.guestPendingUpgradesByKey.get(guestKey) ?? 0
      const workspaceGuestConnectionCount =
        state.guestConnectionCountByWorkspace.get(claims.workspaceId) ?? 0
      const workspaceGuestPendingCount =
        state.guestPendingUpgradesByWorkspace.get(claims.workspaceId) ?? 0
      const overloaded =
        state.activeConnections + state.pendingUpgrades >= maxConnections ||
        state.activeGuestConnections + state.pendingGuestUpgrades >=
          maxGuestConnections ||
        guestConnectionCount + guestPendingCount >= maxConnectionsPerGuest ||
        workspaceGuestConnectionCount + workspaceGuestPendingCount >=
          maxGuestConnectionsPerWorkspace
      if (overloaded) {
        if (aborted) {
          return
        }
        res.cork(() => {
          res.upgrade(
            {
              ...claims,
              closed: false,
              overloadRetryAfterMs: nextOverloadRetryAfterMs(),
              replayCutoff: "0-0",
              replayEntries: [],
            },
            websocketKey,
            websocketProtocol,
            websocketExtensions,
            context,
          )
        })
        state.pendingUpgrades += 1
        state.pendingGuestUpgrades += 1
        return
      }
      state.pendingUpgrades += 1
      state.pendingGuestUpgrades += 1
      acquireSlot([
        { key: guestKey, map: state.guestPendingUpgradesByKey },
        {
          key: claims.workspaceId,
          map: state.guestPendingUpgradesByWorkspace,
        },
      ])

      let activated = false
      try {
        const activationLastId = await streamReader.activateWorkspace(
          claims.workspaceId,
        )
        activated = true
        if (aborted) {
          state.pendingUpgrades -= 1
          state.pendingGuestUpgrades -= 1
          releaseSlot([
            { key: guestKey, map: state.guestPendingUpgradesByKey },
            {
              key: claims.workspaceId,
              map: state.guestPendingUpgradesByWorkspace,
            },
          ])
          streamReader.releaseWorkspace(claims.workspaceId)
          return
        }
        res.cork(() => {
          res.upgrade(
            {
              ...claims,
              closed: false,
              replayCutoff: activationLastId,
              replayEntries: [],
            },
            websocketKey,
            websocketProtocol,
            websocketExtensions,
            context,
          )
        })
      } catch (error) {
        state.pendingUpgrades -= 1
        state.pendingGuestUpgrades -= 1
        releaseSlot([
          { key: guestKey, map: state.guestPendingUpgradesByKey },
          {
            key: claims.workspaceId,
            map: state.guestPendingUpgradesByWorkspace,
          },
        ])
        // `res.upgrade()` above can itself throw (a known uWS footgun
        // when the response aborts mid-call) *after* activation already
        // incremented the shard's `socketCount` — without this, that
        // socketCount would never come back down, pinning the shard's
        // XREAD active forever. See PR #1349 finding #10.
        if (activated) {
          streamReader.releaseWorkspace(claims.workspaceId)
        }
        if (aborted) {
          return
        }
        logger.warn(
          { err: error, guestConversationId },
          "Realtime guest socket activation failed",
        )
        res.cork(() => {
          res.writeStatus("401 Unauthorized").end()
        })
      }
    })().catch((error) => {
      logger.error(
        { err: error, guestConversationId },
        "Unhandled guest realtime upgrade failure",
      )
    })
  },
  open: (socket) => {
    const socketData = socket.getUserData()
    state.pendingUpgrades -= 1
    state.pendingGuestUpgrades -= 1
    if (socketData.overloadRetryAfterMs !== undefined) {
      counters.overloadCloses += 1
      socketData.closed = true
      socket.end(
        REALTIME_CLOSE_CODE.overloaded,
        JSON.stringify({ retryAfter: socketData.overloadRetryAfterMs }),
      )
      return
    }
    state.activeConnections += 1
    state.activeGuestConnections += 1
    state.peakConnections = Math.max(
      state.peakConnections,
      state.activeConnections,
    )
    counters.upgrades += 1
    const guestKey = guestConnectionKey(
      socketData.workspaceId,
      socketData.guestConversationId,
    )
    releaseSlot([
      { key: guestKey, map: state.guestPendingUpgradesByKey },
      {
        key: socketData.workspaceId,
        map: state.guestPendingUpgradesByWorkspace,
      },
    ])
    acquireSlot([
      { key: guestKey, map: state.guestConnectionCountByKey },
      {
        key: socketData.workspaceId,
        map: state.guestConnectionCountByWorkspace,
      },
    ])
    delivery.addGuestSocket(socket)
    delivery.subscribeGuestSocket(socket)
    delivery.replayGuestSocket(socket)
    const gapEntries = streamReader
      .getRecentEntries(socketData.workspaceId, socketData.replayCutoff)
      .filter(
        (entry) =>
          entry.record.kind === "guest-event" &&
          entry.record.workspaceId === socketData.workspaceId &&
          entry.record.guestConversationId === socketData.guestConversationId,
      )
    delivery.replayGuestSocket(socket, gapEntries)
    // Same pending-upgrade-gap rationale as the workspace socket: an
    // invalid record on this shard can arrive while this guest socket's
    // upgrade was still pending, after `onInvalidRecord`'s resync had
    // already run (and so never reached this not-yet-registered
    // socket). See PR #1349 round-5 finding (pending-upgrade gap).
    const taintedUpToId = streamReader.getTaintedUpToId(socketData.workspaceId)
    if (
      taintedUpToId &&
      isRealtimeSeqAfter(taintedUpToId, socketData.replayCutoff)
    ) {
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.resync, "malformed-stream-record")
      return
    }
    // See PR #1349 finding #6 — same rationale as the workspace socket.
    socketData.replayEntries = []
    armLifetimeTimer(
      state.guestLifetimeTimers,
      socketData,
      socket,
      jitteredConnectionLifetimeMs(),
    )
  },
  close: (socket) => {
    const socketData = socket.getUserData()
    socketData.closed = true
    if (socketData.overloadRetryAfterMs !== undefined) {
      return
    }
    state.activeConnections -= 1
    state.activeGuestConnections -= 1
    releaseSlot([
      {
        key: guestConnectionKey(
          socketData.workspaceId,
          socketData.guestConversationId,
        ),
        map: state.guestConnectionCountByKey,
      },
      {
        key: socketData.workspaceId,
        map: state.guestConnectionCountByWorkspace,
      },
    ])
    const lifetimeTimer = state.guestLifetimeTimers.get(socketData)
    clearTimeout(lifetimeTimer)
    state.guestLifetimeTimers.delete(socketData)
    delivery.removeGuestSocket(socket)
    streamReader.releaseWorkspace(socketData.workspaceId)
  },
})
