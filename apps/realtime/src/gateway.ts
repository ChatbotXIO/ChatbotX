import uWS from "uWebSockets.js"
import {
  getRealtimeStreamKey,
  isRealtimeSeqAfter,
  REALTIME_CLOSE_CODE,
  type RealtimeGuestClaims,
  type RealtimeMemberClaims,
  verifyGuestConnectToken,
  verifyMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { PRESENCE_REPORT_INTERVAL_MS } from "@chatbotx.io/realtime-protocol/presence"
import type { Redis } from "@chatbotx.io/redis"
import {
  createRealtimeDelivery,
  type GuestSocketData,
  type StreamRecordEntry,
  type WorkspaceSocketData,
} from "./delivery"
import { reportWorkspacePresence } from "./lib/presence-report"
import {
  createRealtimeServerCounters,
  REALTIME_METRIC_WINDOW_MS,
  recordRealtimeServerWindow,
} from "./lib/realtime-metrics"
import { logger } from "./logger"
import {
  createStreamReader,
  parseStreamRecord,
  type StreamEntry,
} from "./stream-reader"

const SLOW_CONSUMER_BUFFER_BYTES = 512_000
const MAX_REPLAY_ENTRIES = 500
const PRESENCE_REPORT_CONCURRENCY = 16
const PRESENCE_REPORT_COALESCE_MS = 1000
const STREAM_ID_PATTERN = /^\d+-\d+$/
const OVERLOAD_RETRY_AFTER_MIN_MS = 1000
const OVERLOAD_RETRY_AFTER_SPREAD_MS = 4000

/**
 * Jittered retry hint for an overloaded connection. The spread keeps a mass
 * reconnect from re-arriving in lockstep; the client uses this value verbatim.
 */
const nextOverloadRetryAfterMs = (): number =>
  OVERLOAD_RETRY_AFTER_MIN_MS +
  Math.floor(Math.random() * OVERLOAD_RETRY_AFTER_SPREAD_MS)

type ReplayResult = {
  closeReason?: string
  entries: StreamRecordEntry[]
  lastStreamId?: string
}

export type RealtimeGateway = {
  close: () => Promise<void>
  listen: (host: string, port: number) => Promise<void>
}

export const loadReplay = async ({
  lastSeq,
  redis,
  workspaceId,
}: {
  lastSeq?: string
  redis: Redis
  workspaceId: string
}): Promise<ReplayResult> => {
  if (!lastSeq) {
    return { entries: [] }
  }
  if (!STREAM_ID_PATTERN.test(lastSeq)) {
    return { closeReason: "invalid-last-seq", entries: [] }
  }

  const streamKey = getRealtimeStreamKey(workspaceId)
  const [oldestEntries, newestEntries] = (await Promise.all([
    redis.xrange(streamKey, "-", "+", "COUNT", 1),
    redis.xrevrange(streamKey, "+", "-", "COUNT", 1),
  ])) as [StreamEntry[], StreamEntry[]]
  const oldestEntry = oldestEntries[0]
  const newestEntry = newestEntries[0]
  if (oldestEntry && isRealtimeSeqAfter(oldestEntry[0], lastSeq)) {
    return { closeReason: "replay-window-expired", entries: [] }
  }
  if (
    (!newestEntry && lastSeq !== "0-0") ||
    (newestEntry && isRealtimeSeqAfter(lastSeq, newestEntry[0]))
  ) {
    return { closeReason: "replay-cursor-ahead", entries: [] }
  }

  const entries = (await redis.xrange(
    streamKey,
    `(${lastSeq}`,
    "+",
    "COUNT",
    MAX_REPLAY_ENTRIES + 1,
  )) as StreamEntry[]
  if (entries.length > MAX_REPLAY_ENTRIES) {
    return { closeReason: "replay-window-too-large", entries: [] }
  }

  const currentOldestEntries = (await redis.xrange(
    streamKey,
    "-",
    "+",
    "COUNT",
    1,
  )) as StreamEntry[]
  const currentOldestEntry = currentOldestEntries[0]
  if (
    currentOldestEntry &&
    isRealtimeSeqAfter(currentOldestEntry[0], lastSeq)
  ) {
    return { closeReason: "replay-window-expired", entries: [] }
  }

  const parsedEntries: StreamRecordEntry[] = []
  for (const [id, fields] of entries) {
    const record = parseStreamRecord(fields)
    if (!record) {
      logger.warn({ id, workspaceId }, "Ignoring invalid realtime stream entry")
      continue
    }
    if (record.workspaceId === workspaceId) {
      parsedEntries.push({ id, record })
    }
  }
  return {
    entries: parsedEntries,
    lastStreamId: entries.at(-1)?.[0] ?? lastSeq,
  }
}

export const createRealtimeGateway = ({
  maxConnections,
  redis,
  secret,
}: {
  maxConnections: number
  redis: Redis
  secret: string
}): RealtimeGateway => {
  const app = uWS.App()
  const counters = createRealtimeServerCounters()
  const delivery = createRealtimeDelivery(app, counters)
  const connectedUsersByWorkspace = new Map<string, Set<string>>()
  const presenceTimers = new Map<string, NodeJS.Timeout>()
  let heartbeat: NodeJS.Timeout | undefined
  let presenceHeartbeat: NodeJS.Timeout | undefined
  let metricsTimer: NodeJS.Timeout | undefined
  let ready = false
  let stopped = false
  let activeConnections = 0
  let pendingUpgrades = 0
  let peakConnections = 0
  let windowStartedAt = Date.now()

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
              await reportWorkspacePresence(workspaceId, [
                ...(connectedUsersByWorkspace.get(workspaceId) ?? []),
              ]),
          ),
      )
    }
  }

  const markPresenceDirty = (workspaceId: string): void => {
    const existingTimer = presenceTimers.get(workspaceId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
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
      }, PRESENCE_REPORT_COALESCE_MS),
    )
  }

  const streamReader = createStreamReader({
    onEntries: (entries) => {
      counters.records += entries.length
      for (const entry of entries) {
        delivery.dispatch(entry)
      }
    },
    onError: (error) => {
      ready = false
      if (!stopped) {
        logger.error({ err: error }, "Realtime Redis Streams reader failed")
      }
    },
    onReady: () => {
      ready = true
    },
    redis,
  })

  const flushMetrics = (): void => {
    recordRealtimeServerWindow({
      ...counters,
      connections: activeConnections,
      maxConnections: peakConnections,
      shards: streamReader.activeShardCount(),
      windowStartedAt,
    })
    counters.drops = 0
    counters.overloadCloses = 0
    counters.publishBytes = 0
    counters.publishes = 0
    counters.records = 0
    counters.sendBytes = 0
    counters.sends = 0
    counters.tokenRejections = 0
    counters.upgrades = 0
    peakConnections = activeConnections
    windowStartedAt = Date.now()
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

  const registerWorkspaceSocket = (path: string): void => {
    app.ws<WorkspaceSocketData>(path, {
      closeOnBackpressureLimit: true,
      idleTimeout: 60,
      maxBackpressure: SLOW_CONSUMER_BUFFER_BYTES,
      sendPingsAutomatically: true,
      upgrade: (res, req, context) => {
        let aborted = false
        res.onAborted(() => {
          aborted = true
        })
        const workspaceId = req.getParameter("workspaceId")
        const token = req.getQuery("token")
        const lastSeq = req.getQuery("lastSeq")
        const websocketKey = req.getHeader("sec-websocket-key")
        const websocketProtocol = req.getHeader("sec-websocket-protocol")
        const websocketExtensions = req.getHeader("sec-websocket-extensions")
        if (!(workspaceId && token)) {
          counters.tokenRejections += 1
          res.writeStatus("401 Unauthorized").end()
          return
        }

        ;(async () => {
          let claims: RealtimeMemberClaims
          try {
            claims = await verifyMemberConnectToken(token, workspaceId, secret)
          } catch {
            if (!aborted) {
              counters.tokenRejections += 1
              res.writeStatus("401 Unauthorized").end()
            }
            return
          }

          if (activeConnections + pendingUpgrades >= maxConnections) {
            if (aborted) {
              return
            }
            res.cork(() => {
              res.upgrade(
                {
                  ...claims,
                  closed: false,
                  overloadRetryAfterMs: nextOverloadRetryAfterMs(),
                  replayEntries: [],
                  workspaceId,
                },
                websocketKey,
                websocketProtocol,
                websocketExtensions,
                context,
              )
            })
            pendingUpgrades += 1
            return
          }
          pendingUpgrades += 1

          let activated = false
          try {
            const activationLastId =
              await streamReader.activateWorkspace(workspaceId)
            activated = true
            const replay = await loadReplay({ lastSeq, redis, workspaceId })
            if (aborted) {
              pendingUpgrades -= 1
              streamReader.releaseWorkspace(workspaceId)
              return
            }
            res.cork(() => {
              res.upgrade(
                {
                  ...claims,
                  closeReason: replay.closeReason,
                  closed: false,
                  replayCutoff: replay.lastStreamId ?? activationLastId,
                  replayEntries: replay.entries,
                  workspaceId,
                },
                websocketKey,
                websocketProtocol,
                websocketExtensions,
                context,
              )
            })
          } catch (error) {
            if (aborted) {
              pendingUpgrades -= 1
              if (activated) {
                streamReader.releaseWorkspace(workspaceId)
              }
              return
            }
            logger.warn(
              { err: error, workspaceId },
              "Realtime socket replay failed",
            )
            res.cork(() => {
              res.upgrade(
                {
                  ...claims,
                  closeReason: "replay-failed",
                  closed: false,
                  replayEntries: [],
                  workspaceId,
                },
                websocketKey,
                websocketProtocol,
                websocketExtensions,
                context,
              )
            })
          }
        })().catch((error) => {
          logger.error(
            { err: error, workspaceId },
            "Unhandled workspace realtime upgrade failure",
          )
        })
      },
      open: (socket) => {
        const socketData = socket.getUserData()
        pendingUpgrades -= 1
        if (socketData.overloadRetryAfterMs !== undefined) {
          counters.overloadCloses += 1
          socketData.closed = true
          socket.end(
            REALTIME_CLOSE_CODE.overloaded,
            JSON.stringify({ retryAfter: socketData.overloadRetryAfterMs }),
          )
          return
        }
        activeConnections += 1
        peakConnections = Math.max(peakConnections, activeConnections)
        counters.upgrades += 1
        const firstUserSocket = delivery.addWorkspaceSocket(socket)
        delivery.subscribeWorkspaceSocket(socket)
        if (socketData.closeReason) {
          socketData.closed = true
          socket.end(REALTIME_CLOSE_CODE.resync, socketData.closeReason)
          return
        }
        if (!delivery.replayWorkspaceSocket(socket)) {
          return
        }
        const gapEntries = streamReader
          .getRecentEntries(socketData.workspaceId, socketData.replayCutoff)
          .filter(
            (entry) => entry.record.workspaceId === socketData.workspaceId,
          )
        if (!delivery.replayWorkspaceSocket(socket, gapEntries)) {
          return
        }
        if (firstUserSocket) {
          addConnectedUser(socketData.workspaceId, socketData.userId)
        }
      },
      close: (socket) => {
        const socketData = socket.getUserData()
        socketData.closed = true
        if (socketData.overloadRetryAfterMs !== undefined) {
          return
        }
        activeConnections -= 1
        streamReader.releaseWorkspace(socketData.workspaceId)
        if (delivery.removeWorkspaceSocket(socket)) {
          removeConnectedUser(socketData.workspaceId, socketData.userId)
        }
      },
    })
  }

  const registerGuestSocket = (path: string): void => {
    app.ws<GuestSocketData>(path, {
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
        const websocketKey = req.getHeader("sec-websocket-key")
        const websocketProtocol = req.getHeader("sec-websocket-protocol")
        const websocketExtensions = req.getHeader("sec-websocket-extensions")
        if (!(guestConversationId && token)) {
          counters.tokenRejections += 1
          res.writeStatus("401 Unauthorized").end()
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
          } catch {
            if (!aborted) {
              counters.tokenRejections += 1
              res.writeStatus("401 Unauthorized").end()
            }
            return
          }

          if (activeConnections + pendingUpgrades >= maxConnections) {
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
            pendingUpgrades += 1
            return
          }
          pendingUpgrades += 1

          try {
            const activationLastId = await streamReader.activateWorkspace(
              claims.workspaceId,
            )
            if (aborted) {
              pendingUpgrades -= 1
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
            pendingUpgrades -= 1
            if (aborted) {
              return
            }
            logger.warn(
              { err: error, guestConversationId },
              "Realtime guest socket activation failed",
            )
            res.writeStatus("401 Unauthorized").end()
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
        pendingUpgrades -= 1
        if (socketData.overloadRetryAfterMs !== undefined) {
          counters.overloadCloses += 1
          socketData.closed = true
          socket.end(
            REALTIME_CLOSE_CODE.overloaded,
            JSON.stringify({ retryAfter: socketData.overloadRetryAfterMs }),
          )
          return
        }
        activeConnections += 1
        peakConnections = Math.max(peakConnections, activeConnections)
        counters.upgrades += 1
        delivery.subscribeGuestSocket(socket)
        delivery.replayGuestSocket(socket)
        const gapEntries = streamReader
          .getRecentEntries(socketData.workspaceId, socketData.replayCutoff)
          .filter(
            (entry) =>
              entry.record.kind === "guest-event" &&
              entry.record.workspaceId === socketData.workspaceId &&
              entry.record.guestConversationId ===
                socketData.guestConversationId,
          )
        delivery.replayGuestSocket(socket, gapEntries)
      },
      close: (socket) => {
        const socketData = socket.getUserData()
        socketData.closed = true
        if (socketData.overloadRetryAfterMs !== undefined) {
          return
        }
        activeConnections -= 1
        streamReader.releaseWorkspace(socketData.workspaceId)
      },
    })
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
      const { promise, reject, resolve } = Promise.withResolvers<void>()
      app.listen(host, port, (listenSocket) => {
        if (!listenSocket) {
          reject(new Error(`Unable to listen on ${host}:${port}`))
          return
        }
        resolve()
      })
      await promise
      ready = true
      heartbeat = setInterval(() => {
        app.publish("hb", JSON.stringify({ hb: 1 }))
      }, 25_000)
      presenceHeartbeat = setInterval(() => {
        reportLocalPresence([...connectedUsersByWorkspace.keys()]).catch(
          (error) => {
            logger.error({ err: error }, "Failed to report workspace presence")
          },
        )
      }, PRESENCE_REPORT_INTERVAL_MS)
      metricsTimer = setInterval(flushMetrics, REALTIME_METRIC_WINDOW_MS)
      streamReader.start()
    },
  }
}
