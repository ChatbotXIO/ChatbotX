import uWS from "uWebSockets.js"
import {
  getRealtimeStreamKey,
  type RealtimeMemberClaims,
  realtimeBatchEnvelopeSchema,
  realtimeStreamEntrySchema,
  realtimeStreamRecordSchema,
  verifyGuestConnectToken,
  verifyMemberConnectToken,
} from "@chatbotx.io/partysocket-config"
import { PRESENCE_REPORT_INTERVAL_MS } from "@chatbotx.io/partysocket-config/presence"
import type { Redis } from "@chatbotx.io/redis"
import {
  getWorkspaceConnectionTopics,
  getWorkspaceEventTopics,
} from "./gateway-protocol"
import { reportWorkspacePresence } from "./lib/presence-report"
import { logger } from "./logger"

const SLOW_CONSUMER_BUFFER_BYTES = 512_000
const STREAM_READ_BLOCK_MS = 1000
const STREAM_READ_COUNT = 100
const PENDING_CLAIM_IDLE_MS = 60_000
const MAX_REPLAY_ENTRIES = 500
const STREAM_ID_PATTERN = /^\d+-\d+$/
const REALTIME_CLOSE_CODE = { resync: 4002, revoked: 4001 } as const

type WorkspaceSocketData = RealtimeMemberClaims & {
  lastSeq?: string
  workspaceId: string
}
type GuestSocketData = { guestConversationId: string }
type StreamFieldList = [string, string][] | string[]
type StreamEntry = [string, StreamFieldList]
type StreamReadResult = [string, StreamEntry[]][]
type WorkspaceSocket = {
  end: (code?: number, reason?: string) => void
  getUserData: () => WorkspaceSocketData
  send: (data: string) => void
}

type StreamRecord =
  | {
      events: unknown[]
      kind: "workspace-events"
      workspaceId: string
    }
  | {
      event: unknown
      guestConversationId: string
      kind: "guest-event"
      workspaceId: string
    }
  | {
      event: unknown
      kind: "member-send"
      userId: string
      workspaceId: string
    }
  | { kind: "member-revoke"; userId: string; workspaceId: string }
  | { kind: "presence-heartbeat"; userIds: string[]; workspaceId: string }

const toFieldMap = (fields: StreamFieldList): Map<string, string> => {
  if (fields.length === 0) {
    return new Map()
  }
  if (Array.isArray(fields[0])) {
    return new Map(fields as [string, string][])
  }

  const flattenedFields = fields as string[]
  const fieldMap = new Map<string, string>()
  for (let index = 0; index < flattenedFields.length; index += 2) {
    const key = flattenedFields[index]
    const value = flattenedFields[index + 1]
    if (key !== undefined && value !== undefined) {
      fieldMap.set(key, value)
    }
  }
  return fieldMap
}

const encodeBatch = (events: unknown[], seq?: string): string =>
  JSON.stringify({
    batch: events,
    ...(seq ? { seq } : {}),
  })

const parseStreamRecord = (fields: StreamFieldList): StreamRecord | null => {
  const values = toFieldMap(fields)
  const serializedRecord = values.get("record")
  try {
    if (serializedRecord) {
      return realtimeStreamRecordSchema.parse(JSON.parse(serializedRecord))
    }

    return {
      ...realtimeStreamEntrySchema.parse({
        events: JSON.parse(values.get("events") ?? "null"),
        workspaceId: values.get("workspaceId"),
      }),
      kind: "workspace-events",
    }
  } catch (error) {
    logger.warn({ err: error }, "Ignoring invalid realtime stream entry")
    return null
  }
}

const memberKey = (workspaceId: string, userId: string): string =>
  `${workspaceId}:${userId}`

const isStreamIdBefore = (left: string, right: string): boolean => {
  const [leftMilliseconds, leftSequence] = left.split("-").map(BigInt)
  const [rightMilliseconds, rightSequence] = right.split("-").map(BigInt)
  return (
    leftMilliseconds < rightMilliseconds ||
    (leftMilliseconds === rightMilliseconds && leftSequence < rightSequence)
  )
}

export type RealtimeGateway = {
  close: () => Promise<void>
  listen: (host: string, port: number) => Promise<void>
}

export const createRealtimeGateway = ({
  consumerGroup,
  consumerName,
  redis,
  secret,
  shards,
}: {
  consumerGroup: string
  consumerName: string
  redis: Redis
  secret: string
  shards: number[]
}): RealtimeGateway => {
  const app = uWS.App()
  const streamKeys = shards.map((shard) => `rt:{${shard}}`)
  const connectionsByMember = new Map<string, Set<WorkspaceSocket>>()
  const connectedUsersByWorkspace = new Map<string, Set<string>>()
  let presenceHeartbeat: NodeJS.Timeout | null = null
  let ready = false
  let stopped = false
  let streamLoops: Promise<void> | null = null

  const addConnection = (socket: WorkspaceSocket): void => {
    const { workspaceId, userId } = socket.getUserData()
    const key = memberKey(workspaceId, userId)
    const sockets = connectionsByMember.get(key) ?? new Set<WorkspaceSocket>()
    sockets.add(socket)
    connectionsByMember.set(key, sockets)
    const users =
      connectedUsersByWorkspace.get(workspaceId) ?? new Set<string>()
    users.add(userId)
    connectedUsersByWorkspace.set(workspaceId, users)
  }

  const removeConnection = (socket: WorkspaceSocket): void => {
    const { workspaceId, userId } = socket.getUserData()
    const key = memberKey(workspaceId, userId)
    const sockets = connectionsByMember.get(key)
    if (!sockets) {
      return
    }
    sockets.delete(socket)
    if (sockets.size > 0) {
      return
    }
    connectionsByMember.delete(key)
    const users = connectedUsersByWorkspace.get(workspaceId)
    users?.delete(userId)
    if (users?.size === 0) {
      connectedUsersByWorkspace.delete(workspaceId)
    }
  }

  const reportLocalPresence = async (): Promise<void> => {
    await Promise.all(
      Array.from(
        connectedUsersByWorkspace,
        async ([workspaceId, userIds]) =>
          await reportWorkspacePresence(workspaceId, [...userIds]),
      ),
    )
  }

  const sendWorkspaceEvent = (
    socket: WorkspaceSocket,
    event: unknown,
    seq: string,
  ): void => {
    const parsedEvent = realtimeBatchEnvelopeSchema.safeParse({
      batch: [event],
    })
    if (!parsedEvent.success) {
      return
    }
    const allowedTopics = new Set(
      getWorkspaceConnectionTopics(socket.getUserData()),
    )
    const eventTopics = getWorkspaceEventTopics(
      socket.getUserData().workspaceId,
      parsedEvent.data.batch[0],
    )
    if (!eventTopics.some((topic) => allowedTopics.has(topic))) {
      return
    }
    socket.send(encodeBatch([parsedEvent.data.batch[0]], seq))
  }

  const publishWorkspaceEvent = (
    workspaceId: string,
    event: unknown,
    seq: string,
  ): void => {
    const parsedEvent = realtimeBatchEnvelopeSchema.safeParse({
      batch: [event],
    })
    if (!parsedEvent.success) {
      return
    }
    const frame = encodeBatch([parsedEvent.data.batch[0]], seq)
    for (const topic of getWorkspaceEventTopics(
      workspaceId,
      parsedEvent.data.batch[0],
    )) {
      app.publish(topic, frame)
    }
  }

  const dispatchStreamRecord = (record: StreamRecord, seq: string): void => {
    switch (record.kind) {
      case "workspace-events":
        for (const event of record.events) {
          publishWorkspaceEvent(record.workspaceId, event, seq)
        }
        return
      case "guest-event":
        app.publish(
          `guest:${record.guestConversationId}`,
          encodeBatch([record.event], seq),
        )
        return
      case "member-send":
        app.publish(
          `ws:${record.workspaceId}:user:${record.userId}`,
          encodeBatch([record.event], seq),
        )
        return
      case "member-revoke": {
        const sockets = connectionsByMember.get(
          memberKey(record.workspaceId, record.userId),
        )
        if (!sockets) {
          return
        }
        for (const socket of sockets) {
          socket.end(REALTIME_CLOSE_CODE.revoked, "revoked")
        }
        return
      }
      case "presence-heartbeat":
        return
      default:
        return
    }
  }

  const replayWorkspaceSocket = async (
    socket: WorkspaceSocket,
  ): Promise<void> => {
    const { lastSeq, workspaceId } = socket.getUserData()
    if (!lastSeq) {
      return
    }
    if (!STREAM_ID_PATTERN.test(lastSeq)) {
      socket.end(REALTIME_CLOSE_CODE.resync, "invalid-last-seq")
      return
    }

    const streamKey = getRealtimeStreamKey(workspaceId)
    const oldestEntries = (await redis.xrange(
      streamKey,
      "-",
      "+",
      "COUNT",
      1,
    )) as StreamEntry[]
    const oldestEntry = oldestEntries[0]
    if (oldestEntry && isStreamIdBefore(lastSeq, oldestEntry[0])) {
      socket.end(REALTIME_CLOSE_CODE.resync, "replay-window-expired")
      return
    }

    const entries = (await redis.xrange(
      streamKey,
      `(${lastSeq}`,
      "+",
      "COUNT",
      MAX_REPLAY_ENTRIES + 1,
    )) as StreamEntry[]
    if (entries.length > MAX_REPLAY_ENTRIES) {
      socket.end(REALTIME_CLOSE_CODE.resync, "replay-window-too-large")
      return
    }
    for (const [entryId, fields] of entries) {
      const record = parseStreamRecord(fields)
      if (!record || record.workspaceId !== workspaceId) {
        continue
      }
      if (record.kind === "workspace-events") {
        for (const event of record.events) {
          sendWorkspaceEvent(socket, event, entryId)
        }
        continue
      }
      if (
        record.kind === "member-send" &&
        record.userId === socket.getUserData().userId
      ) {
        socket.send(encodeBatch([record.event], entryId))
      }
      if (
        record.kind === "member-revoke" &&
        record.userId === socket.getUserData().userId
      ) {
        socket.end(REALTIME_CLOSE_CODE.revoked, "revoked")
      }
    }
  }

  const consumeEntries = async (
    streamKey: string,
    entries: StreamEntry[],
  ): Promise<void> => {
    const acknowledgedIds: string[] = []
    for (const [entryId, fields] of entries) {
      const record = parseStreamRecord(fields)
      if (record) {
        dispatchStreamRecord(record, entryId)
      }
      acknowledgedIds.push(entryId)
    }
    if (acknowledgedIds.length > 0) {
      await redis.xack(streamKey, consumerGroup, ...acknowledgedIds)
    }
  }

  const recoverPendingEntries = async (
    reader: Redis,
    streamKey: string,
  ): Promise<void> => {
    const [, entries] = (await reader.xautoclaim(
      streamKey,
      consumerGroup,
      consumerName,
      PENDING_CLAIM_IDLE_MS,
      "0-0",
      "COUNT",
      STREAM_READ_COUNT,
    )) as [string, StreamEntry[], string[]]
    if (entries.length > 0) {
      await consumeEntries(streamKey, entries)
    }
  }

  const consumeStream = async (streamKey: string): Promise<void> => {
    const reader = redis.duplicate()
    try {
      await recoverPendingEntries(reader, streamKey)
      while (!stopped) {
        const response = (await reader.call(
          "XREADGROUP",
          "GROUP",
          consumerGroup,
          consumerName,
          "BLOCK",
          STREAM_READ_BLOCK_MS,
          "COUNT",
          STREAM_READ_COUNT,
          "STREAMS",
          streamKey,
          ">",
        )) as StreamReadResult | null
        if (!response) {
          continue
        }
        for (const [, entries] of response) {
          await consumeEntries(streamKey, entries)
        }
      }
    } finally {
      reader.disconnect()
    }
  }

  const initializeConsumerGroups = async (): Promise<void> => {
    for (const streamKey of streamKeys) {
      try {
        await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes("BUSYGROUP")) {
          throw error
        }
      }
    }
  }

  const registerWorkspaceSocket = (path: string): void => {
    app.ws<WorkspaceSocketData>(path, {
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
          res.writeStatus("401 Unauthorized").end()
          return
        }
        verifyMemberConnectToken(token, workspaceId, secret)
          .then((claims) => {
            if (aborted) {
              return
            }
            res.cork(() => {
              res.upgrade(
                { ...claims, lastSeq: lastSeq || undefined, workspaceId },
                websocketKey,
                websocketProtocol,
                websocketExtensions,
                context,
              )
            })
          })
          .catch(() => {
            if (!aborted) {
              res.writeStatus("401 Unauthorized").end()
            }
          })
      },
      open: async (socket) => {
        addConnection(socket)
        for (const topic of getWorkspaceConnectionTopics(
          socket.getUserData(),
        )) {
          socket.subscribe(topic)
        }
        await replayWorkspaceSocket(socket)
        await reportLocalPresence()
      },
      close: async (socket) => {
        removeConnection(socket)
        await reportLocalPresence()
      },
    })
  }

  const registerGuestSocket = (path: string): void => {
    app.ws<GuestSocketData>(path, {
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
          res.writeStatus("401 Unauthorized").end()
          return
        }
        verifyGuestConnectToken(token, guestConversationId, secret)
          .then(() => {
            if (aborted) {
              return
            }
            res.cork(() => {
              res.upgrade(
                { guestConversationId },
                websocketKey,
                websocketProtocol,
                websocketExtensions,
                context,
              )
            })
          })
          .catch(() => {
            if (!aborted) {
              res.writeStatus("401 Unauthorized").end()
            }
          })
      },
      open: (socket) => {
        socket.subscribe(`guest:${socket.getUserData().guestConversationId}`)
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
  registerWorkspaceSocket("/parties/workspaces/:workspaceId")
  registerGuestSocket("/parties/guests/:guestConversationId")

  return {
    async close() {
      stopped = true
      ready = false
      if (presenceHeartbeat) {
        clearInterval(presenceHeartbeat)
        presenceHeartbeat = null
      }
      app.close()
      await streamLoops
      redis.disconnect()
    },
    async listen(host, port) {
      await initializeConsumerGroups()
      await new Promise<void>((resolve, reject) => {
        app.listen(host, port, (listenSocket) => {
          if (!listenSocket) {
            reject(new Error(`Unable to listen on ${host}:${port}`))
            return
          }
          resolve()
        })
      })
      ready = true
      presenceHeartbeat = setInterval(async () => {
        await reportLocalPresence()
      }, PRESENCE_REPORT_INTERVAL_MS)
      streamLoops = Promise.all(streamKeys.map(consumeStream))
        .then(() => undefined)
        .catch((error: unknown) => {
          ready = false
          if (!stopped) {
            logger.error(
              { err: error },
              "Realtime Redis Streams consumer stopped",
            )
          }
        })
    },
  }
}
