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
/** Guest pool ceiling when the caller doesn't pass one explicitly (tests). */
const DEFAULT_GUEST_CONNECTION_SHARE = 0.8
const DEFAULT_MAX_CONNECTIONS_PER_WORKSPACE = 500
const DEFAULT_MAX_CONNECTIONS_PER_GUEST = 5
/** Caps one workspace's *total* guest connections (across every distinct
 * `guestConversationId`) well below the global guest pool, so one tenant's
 * webchat traffic spike can't exhaust `maxGuestConnections` for everyone
 * else. `maxConnectionsPerGuest` alone doesn't bound this: it only limits
 * one guest conversation, not how many distinct conversations a single
 * workspace can open. */
const DEFAULT_MAX_GUEST_CONNECTIONS_PER_WORKSPACE = 1000
/** Forces every connection to periodically re-handshake (fresh token mint,
 * re-checked membership/permissions) instead of living forever once open —
 * the only way a revoked member, a disabled support-access session, or an
 * expired grant stops receiving events short of an explicit revoke event. */
const DEFAULT_CONNECTION_LIFETIME_MS = 30 * 60 * 1000

/**
 * Jittered retry hint for an overloaded connection. The spread keeps a mass
 * reconnect from re-arriving in lockstep; the client uses this value verbatim.
 */
const nextOverloadRetryAfterMs = (): number =>
  OVERLOAD_RETRY_AFTER_MIN_MS +
  Math.floor(Math.random() * OVERLOAD_RETRY_AFTER_SPREAD_MS)

const incrementKeyedCount = (
  counts: Map<string, number>,
  key: string,
): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

const decrementKeyedCount = (
  counts: Map<string, number>,
  key: string,
): void => {
  const next = (counts.get(key) ?? 0) - 1
  if (next > 0) {
    counts.set(key, next)
  } else {
    counts.delete(key)
  }
}

type ReplayResult = {
  closeReason?: string
  entries: StreamRecordEntry[]
  lastStreamId?: string
}

export type RealtimeGateway = {
  close: () => Promise<void>
  /** Resolves with the actual bound port — useful for `port: 0` (OS-assigned). */
  listen: (host: string, port: number) => Promise<number>
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
  connectionLifetimeMs = DEFAULT_CONNECTION_LIFETIME_MS,
  maxConnections,
  maxConnectionsPerGuest = DEFAULT_MAX_CONNECTIONS_PER_GUEST,
  maxConnectionsPerWorkspace = DEFAULT_MAX_CONNECTIONS_PER_WORKSPACE,
  maxGuestConnections = Math.floor(
    maxConnections * DEFAULT_GUEST_CONNECTION_SHARE,
  ),
  maxGuestConnectionsPerWorkspace = DEFAULT_MAX_GUEST_CONNECTIONS_PER_WORKSPACE,
  redis,
  secret,
}: {
  connectionLifetimeMs?: number
  maxConnections: number
  maxConnectionsPerGuest?: number
  maxConnectionsPerWorkspace?: number
  maxGuestConnections?: number
  maxGuestConnectionsPerWorkspace?: number
  redis: Redis
  secret: string
}): RealtimeGateway => {
  const app = uWS.App()
  const counters = createRealtimeServerCounters()
  const delivery = createRealtimeDelivery(app, counters)
  const connectedUsersByWorkspace = new Map<string, Set<string>>()
  const presenceTimers = new Map<string, NodeJS.Timeout>()
  // Reserves headroom for members: guests draw from their own sub-pool
  // (`maxGuestConnections`, strictly below `maxConnections`) so a guest-side
  // flood can never consume every slot a member needs to connect.
  let activeGuestConnections = 0
  let pendingGuestUpgrades = 0
  const memberConnectionCountByWorkspace = new Map<string, number>()
  const guestConnectionCountByKey = new Map<string, number>()
  const guestConnectionCountByWorkspace = new Map<string, number>()
  const workspaceLifetimeTimers = new WeakMap<
    WorkspaceSocketData,
    NodeJS.Timeout
  >()
  const guestLifetimeTimers = new WeakMap<GuestSocketData, NodeJS.Timeout>()
  let heartbeat: NodeJS.Timeout | undefined
  let presenceHeartbeat: NodeJS.Timeout | undefined
  let metricsTimer: NodeJS.Timeout | undefined
  let ready = false
  let stopped = false
  let activeConnections = 0
  let pendingUpgrades = 0
  let peakConnections = 0
  let windowStartedAt = Date.now()

  const guestConnectionKey = (
    workspaceId: string,
    guestConversationId: string,
  ): string => `${workspaceId}:${guestConversationId}`

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
        // One malformed/unexpected record must not take the rest of this
        // batch down with it: `dispatchEntries` already advanced the shard's
        // `lastId` past every entry here, so a throw escaping this loop would
        // both lose every entry after the failing one (they'll never be
        // replayed — the cursor has already moved past them) and flip
        // `ready = false` for the whole process via `onError` below.
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
          res.cork(() => {
            res.writeStatus("401 Unauthorized").end()
          })
          return
        }

        ;(async () => {
          let claims: RealtimeMemberClaims
          try {
            claims = await verifyMemberConnectToken(token, workspaceId, secret)
          } catch {
            if (!aborted) {
              counters.tokenRejections += 1
              res.cork(() => {
                res.writeStatus("401 Unauthorized").end()
              })
            }
            return
          }

          const workspaceConnectionCount =
            memberConnectionCountByWorkspace.get(workspaceId) ?? 0
          const overloaded =
            activeConnections + pendingUpgrades >= maxConnections ||
            workspaceConnectionCount >= maxConnectionsPerWorkspace
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
                  activated,
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
                  activated,
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
        incrementKeyedCount(
          memberConnectionCountByWorkspace,
          socketData.workspaceId,
        )
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
        workspaceLifetimeTimers.set(
          socketData,
          setTimeout(() => {
            if (socketData.closed) {
              return
            }
            socketData.closed = true
            socket.end(
              REALTIME_CLOSE_CODE.resync,
              "connection-lifetime-exceeded",
            )
          }, connectionLifetimeMs),
        )
      },
      close: (socket) => {
        const socketData = socket.getUserData()
        socketData.closed = true
        if (socketData.overloadRetryAfterMs !== undefined) {
          return
        }
        activeConnections -= 1
        decrementKeyedCount(
          memberConnectionCountByWorkspace,
          socketData.workspaceId,
        )
        const lifetimeTimer = workspaceLifetimeTimers.get(socketData)
        clearTimeout(lifetimeTimer)
        workspaceLifetimeTimers.delete(socketData)
        // Only release the shard this socket actually activated: if
        // `activateWorkspace` itself threw during upgrade, `activated` stays
        // false and this socket never incremented the shard's `socketCount`
        // — releasing here would underflow it and deactivate a shard other
        // live sockets still depend on.
        if (socketData.activated) {
          streamReader.releaseWorkspace(socketData.workspaceId)
        }
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
          } catch {
            if (!aborted) {
              counters.tokenRejections += 1
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
            guestConnectionCountByKey.get(guestKey) ?? 0
          const workspaceGuestConnectionCount =
            guestConnectionCountByWorkspace.get(claims.workspaceId) ?? 0
          const overloaded =
            activeConnections + pendingUpgrades >= maxConnections ||
            activeGuestConnections + pendingGuestUpgrades >=
              maxGuestConnections ||
            guestConnectionCount >= maxConnectionsPerGuest ||
            workspaceGuestConnectionCount >= maxGuestConnectionsPerWorkspace
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
            pendingUpgrades += 1
            pendingGuestUpgrades += 1
            return
          }
          pendingUpgrades += 1
          pendingGuestUpgrades += 1

          try {
            const activationLastId = await streamReader.activateWorkspace(
              claims.workspaceId,
            )
            if (aborted) {
              pendingUpgrades -= 1
              pendingGuestUpgrades -= 1
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
            pendingGuestUpgrades -= 1
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
        pendingUpgrades -= 1
        pendingGuestUpgrades -= 1
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
        activeGuestConnections += 1
        peakConnections = Math.max(peakConnections, activeConnections)
        counters.upgrades += 1
        incrementKeyedCount(
          guestConnectionCountByKey,
          guestConnectionKey(
            socketData.workspaceId,
            socketData.guestConversationId,
          ),
        )
        incrementKeyedCount(
          guestConnectionCountByWorkspace,
          socketData.workspaceId,
        )
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
        guestLifetimeTimers.set(
          socketData,
          setTimeout(() => {
            if (socketData.closed) {
              return
            }
            socketData.closed = true
            socket.end(
              REALTIME_CLOSE_CODE.resync,
              "connection-lifetime-exceeded",
            )
          }, connectionLifetimeMs),
        )
      },
      close: (socket) => {
        const socketData = socket.getUserData()
        socketData.closed = true
        if (socketData.overloadRetryAfterMs !== undefined) {
          return
        }
        activeConnections -= 1
        activeGuestConnections -= 1
        decrementKeyedCount(
          guestConnectionCountByKey,
          guestConnectionKey(
            socketData.workspaceId,
            socketData.guestConversationId,
          ),
        )
        decrementKeyedCount(
          guestConnectionCountByWorkspace,
          socketData.workspaceId,
        )
        const lifetimeTimer = guestLifetimeTimers.get(socketData)
        clearTimeout(lifetimeTimer)
        guestLifetimeTimers.delete(socketData)
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
      return boundPort
    },
  }
}
