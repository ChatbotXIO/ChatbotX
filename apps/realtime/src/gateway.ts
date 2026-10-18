import uWS from "uWebSockets.js"
import { getRealtimeStreamShard } from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import {
  createRealtimeDelivery,
  type GuestSocketData,
  type WorkspaceSocketData,
} from "./delivery"
import type { RealtimeGatewayConfig } from "./gateway-config"
import { createGuestSocketBehavior } from "./gateway-guest-socket"
import { createGatewayConnectionState } from "./gateway-shared"
import { createWorkspaceSocketBehavior } from "./gateway-workspace-socket"
import { reportWorkspacePresence } from "./lib/presence-report"
import {
  createRealtimeServerCounters,
  REALTIME_METRIC_WINDOW_MS,
  recordRealtimeServerWindow,
} from "./lib/realtime-metrics"
import { logger } from "./logger"
import { createStreamReader } from "./stream-reader"

const PRESENCE_REPORT_CONCURRENCY = 16
const CONNECTION_LIFETIME_JITTER_RATIO = 0.15
const HEARTBEAT_FRAME = JSON.stringify({ hb: 1 })

export type RealtimeGateway = {
  close: () => Promise<void>
  /** Resolves with the actual bound port — useful for `port: 0` (OS-assigned). */
  listen: (host: string, port: number) => Promise<number>
}

export type RealtimeGatewayOptions = RealtimeGatewayConfig & {
  redis: Redis
}

export const createRealtimeGateway = ({
  builderUrl,
  connectionLifetimeMs,
  maxConnections,
  maxConnectionsPerGuest,
  maxConnectionsPerWorkspace,
  maxGuestConnections,
  maxGuestConnectionsPerWorkspace,
  presenceReportCoalesceMs,
  presenceReportIntervalMs,
  redis,
  secret,
}: RealtimeGatewayOptions): RealtimeGateway => {
  const app = uWS.App()
  const counters = createRealtimeServerCounters()
  const delivery = createRealtimeDelivery(app, counters)
  const connectedUsersByWorkspace = new Map<string, Set<string>>()
  const presenceTimers = new Map<string, NodeJS.Timeout>()
  const state = createGatewayConnectionState<
    WorkspaceSocketData,
    GuestSocketData
  >()
  const jitteredConnectionLifetimeMs = (): number =>
    connectionLifetimeMs +
    Math.floor(
      (Math.random() * 2 - 1) *
        connectionLifetimeMs *
        CONNECTION_LIFETIME_JITTER_RATIO,
    )
  let heartbeat: NodeJS.Timeout | undefined
  let presenceHeartbeat: NodeJS.Timeout | undefined
  let metricsTimer: NodeJS.Timeout | undefined
  let ready = false
  let stopped = false
  let windowStartedAt = Date.now()

  const TOKEN_REJECTION_LOG_WINDOW_MS = 10_000
  let lastTokenRejectionLogAt = 0
  let suppressedTokenRejectionCount = 0
  const logTokenRejection = (
    context: Record<string, unknown>,
    error: unknown,
  ): void => {
    const now = Date.now()
    if (now - lastTokenRejectionLogAt < TOKEN_REJECTION_LOG_WINDOW_MS) {
      suppressedTokenRejectionCount += 1
      return
    }
    const suppressed = suppressedTokenRejectionCount
    suppressedTokenRejectionCount = 0
    lastTokenRejectionLogAt = now
    logger.warn(
      { err: error, suppressed, ...context },
      "Realtime connect token verification failed",
    )
  }

  const reportLocalPresence = async (workspaceIds: string[]): Promise<void> => {
    for (
      let index = 0;
      index < workspaceIds.length;
      index += PRESENCE_REPORT_CONCURRENCY
    ) {
      await Promise.all(
        workspaceIds
          .slice(index, index + PRESENCE_REPORT_CONCURRENCY)
          .map(
            async (workspaceId) =>
              await reportWorkspacePresence(
                workspaceId,
                [...(connectedUsersByWorkspace.get(workspaceId) ?? [])],
                builderUrl,
                secret,
              ),
          ),
      )
    }
  }

  const markPresenceDirty = (workspaceId: string): void => {
    if (stopped) {
      return
    }
    clearTimeout(presenceTimers.get(workspaceId))
    presenceTimers.set(
      workspaceId,
      setTimeout(() => {
        presenceTimers.delete(workspaceId)
        reportLocalPresence([workspaceId]).catch((error) => {
          logger.error(
            { err: error, workspaceId },
            "Failed to report workspace presence",
          )
        })
      }, presenceReportCoalesceMs),
    )
  }

  const addConnectedUser = (workspaceId: string, userId: string): void => {
    const users =
      connectedUsersByWorkspace.get(workspaceId) ?? new Set<string>()
    users.add(userId)
    connectedUsersByWorkspace.set(workspaceId, users)
    markPresenceDirty(workspaceId)
  }

  const removeConnectedUser = (workspaceId: string, userId: string): void => {
    const users = connectedUsersByWorkspace.get(workspaceId)
    if (!users) {
      return
    }
    users.delete(userId)
    if (users.size === 0) {
      connectedUsersByWorkspace.delete(workspaceId)
    }
    markPresenceDirty(workspaceId)
  }

  const allConnectedWorkspaceIds = (): Set<string> => {
    const workspaceIds = new Set<string>()
    for (const workspaceId of state.memberConnectionCountByWorkspace.keys()) {
      workspaceIds.add(workspaceId)
    }
    for (const workspaceId of state.guestConnectionCountByWorkspace.keys()) {
      workspaceIds.add(workspaceId)
    }
    return workspaceIds
  }

  const resyncShard = (shard: number, reason: string): void => {
    for (const workspaceId of allConnectedWorkspaceIds()) {
      if (getRealtimeStreamShard(workspaceId) === shard) {
        delivery.resyncWorkspace(workspaceId, reason)
      }
    }
  }

  const resyncAllWorkspaces = (reason: string): void => {
    for (const workspaceId of allConnectedWorkspaceIds()) {
      delivery.resyncWorkspace(workspaceId, reason)
    }
  }

  const streamReader = createStreamReader({
    onEntries: (entries) => {
      counters.records += entries.length
      for (const entry of entries) {
        try {
          delivery.dispatch(entry)
        } catch (error) {
          logger.error(
            { err: error, id: entry.id, kind: entry.record.kind },
            "Failed to dispatch realtime stream entry",
          )
        }
      }
    },
    onError: (error) => {
      ready = false
      if (!stopped) {
        logger.error({ err: error }, "Realtime Redis Streams reader failed")
      }
    },
    onReconnect: () => {
      ready = false
      if (!stopped) {
        logger.warn("Realtime Redis Streams reader reconnecting")
      }
    },
    onInvalidRecord: ({ shard, workspaceId }) => {
      counters.malformedRecords += 1
      if (workspaceId) {
        delivery.resyncWorkspace(workspaceId, "malformed-stream-record")
        return
      }
      resyncShard(shard, "malformed-stream-record")
    },
    onReady: () => {
      ready = true
    },
    onRecovered: () => {
      if (!stopped) {
        resyncAllWorkspaces("stream-reader-recovered")
      }
    },
    redis,
  })

  const flushMetrics = (): void => {
    recordRealtimeServerWindow({
      ...counters,
      connections: state.activeConnections,
      maxConnections: state.peakConnections,
      shards: streamReader.activeShardCount(),
      windowStartedAt,
    })
    counters.drops = 0
    counters.malformedRecords = 0
    counters.overloadCloses = 0
    counters.publishBytes = 0
    counters.publishes = 0
    counters.records = 0
    counters.sendBytes = 0
    counters.sends = 0
    counters.tokenRejections = 0
    counters.upgrades = 0
    state.peakConnections = state.activeConnections
    windowStartedAt = Date.now()
  }

  const registerWorkspaceSocket = (path: string): void => {
    app.ws<WorkspaceSocketData>(
      path,
      createWorkspaceSocketBehavior({
        addConnectedUser,
        counters,
        delivery,
        jitteredConnectionLifetimeMs,
        logTokenRejection,
        maxConnections,
        maxConnectionsPerWorkspace,
        redis,
        removeConnectedUser,
        secret,
        state,
        streamReader,
      }),
    )
  }

  const registerGuestSocket = (path: string): void => {
    app.ws<GuestSocketData>(
      path,
      createGuestSocketBehavior({
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
      }),
    )
  }

  app.get("/health", (res) => {
    res.end("ok")
  })
  app.get("/ready", (res) => {
    if (!ready) {
      res.writeStatus("503 Service Unavailable").end("not ready")
      return
    }
    res.end("ready")
  })
  registerWorkspaceSocket("/rt/workspaces/:workspaceId")
  registerGuestSocket("/rt/guests/:guestConversationId")

  return {
    close: async () => {
      stopped = true
      ready = false
      clearInterval(heartbeat)
      clearInterval(presenceHeartbeat)
      clearInterval(metricsTimer)
      for (const timer of presenceTimers.values()) {
        clearTimeout(timer)
      }
      presenceTimers.clear()
      app.close()
      await streamReader.close()
      redis.disconnect()
    },
    listen: async (host, port) => {
      const { promise, reject, resolve } = Promise.withResolvers<number>()
      app.listen(host, port, (listenSocket) => {
        if (!listenSocket) {
          reject(new Error(`Unable to listen on ${host}:${port}`))
          return
        }
        resolve(uWS.us_socket_local_port(listenSocket))
      })
      const boundPort = await promise
      ready = true
      heartbeat = setInterval(() => {
        app.publish("hb", HEARTBEAT_FRAME)
      }, 25_000)
      presenceHeartbeat = setInterval(() => {
        reportLocalPresence([...connectedUsersByWorkspace.keys()]).catch(
          (error) => {
            logger.error({ err: error }, "Failed to report workspace presence")
          },
        )
      }, presenceReportIntervalMs)
      metricsTimer = setInterval(flushMetrics, REALTIME_METRIC_WINDOW_MS)
      streamReader.start()
      return boundPort
    },
  }
}
