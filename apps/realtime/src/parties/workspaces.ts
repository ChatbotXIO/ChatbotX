import {
  REALTIME_EVENT_TOPICS,
  type RealtimeEventEnvelope,
  RealtimeProtocol,
  type RealtimeTopic,
  realtimeEventEnvelopeSchema,
  realtimeProtocolSchema,
  realtimeSubscriptionMessageSchema,
} from "@chatbotx.io/partysocket-config"
import { verifyMemberConnectToken } from "@chatbotx.io/partysocket-config/auth"
import {
  PRESENCE_REPORT_INTERVAL_MS,
  presencePingMessageSchema,
} from "@chatbotx.io/partysocket-config/presence"
import type * as Party from "partykit/server"
import { z } from "zod"
import { env } from "../env"
import { toUserConnectionTag } from "../lib/connection-tags"
import { reportWorkspacePresence } from "../lib/presence-report"
import { verifyBroadcastRequest } from "../lib/realtime-auth"
import { logger } from "../logger"

const REVOKE_ACTION = "revoke"
const TARGET_USER_QUERY_PARAM = "userId"
const ACTION_QUERY_PARAM = "action"
const REVOKE_CLOSE_CODE = 4001
const REVOKE_CLOSE_REASON = "Revoked"
const PROTOCOL_QUERY_PARAM = "protocol"
const PROTOCOL_HEADER = "X-Realtime-Protocol"
const BATCH_HEADER = "X-Realtime-Batch"

/** Batch body shape only; items are validated individually. */
const realtimeBatchBodySchema = z.object({ batch: z.array(z.unknown()) })

/** Re-exported so existing importers of this module keep working. */
export { PRESENCE_REPORT_INTERVAL_MS } from "@chatbotx.io/partysocket-config/presence"

/**
 * PartyKit alarms cannot read `room.id`, so the workspace id is cached in
 * storage.
 */
const PRESENCE_WORKSPACE_ID_STORAGE_KEY = "presenceWorkspaceId"

/**
 * Epoch ms of the last confirmed report-loop tick. Freshness is used instead of
 * `getAlarm()` because a scheduled alarm can silently never fire; a stale
 * marker triggers a re-bootstrap.
 */
const PRESENCE_LAST_ARMED_AT_STORAGE_KEY = "presenceLastArmedAt"

/**
 * Half an interval of slack absorbs jitter while staying under the presence
 * TTL.
 */
const REPORT_LOOP_STALE_THRESHOLD_MS = PRESENCE_REPORT_INTERVAL_MS * 1.5

type WorkspaceConnectionState = {
  protocol: RealtimeProtocol
  /**
   * `null` before the first subscription frame fails open; `[]` after one
   * explicitly opts out of every topic and receives no events.
   */
  topics: RealtimeTopic[] | null
  userId: string
}

type WorkspaceRealtimeEvent = RealtimeEventEnvelope & {
  eventType: keyof typeof REALTIME_EVENT_TOPICS
}

const isWorkspaceRealtimeEvent = (
  event: RealtimeEventEnvelope,
): event is WorkspaceRealtimeEvent =>
  Object.hasOwn(REALTIME_EVENT_TOPICS, event.eventType)

type DroppedBatchItem = {
  index: number
  eventType: string | null
}

type ExtractedWorkspaceEvents = {
  events: WorkspaceRealtimeEvent[]
  dropped: DroppedBatchItem[]
}

const toDroppedBatchItem = (item: unknown, index: number): DroppedBatchItem => {
  const eventType =
    typeof item === "object" &&
    item !== null &&
    "eventType" in item &&
    typeof item.eventType === "string"
      ? item.eventType
      : null
  return { index, eventType }
}

/**
 * Extracts known event envelopes from a POST body: `{ batch: [...] }` under
 * `X-Realtime-Batch: 1`, otherwise the raw body is treated as a single event.
 * Batch items are validated one by one so a single malformed or unknown item
 * is dropped (and reported in `dropped`) without discarding the valid events
 * coalesced alongside it. Returns `null` when nothing deliverable remains,
 * including inherited event names.
 */
const extractWorkspaceEvents = (
  payload: unknown,
  isBatch: boolean,
): ExtractedWorkspaceEvents | null => {
  if (!isBatch) {
    const result = realtimeEventEnvelopeSchema.safeParse(payload)
    return result.success && isWorkspaceRealtimeEvent(result.data)
      ? { events: [result.data], dropped: [] }
      : null
  }

  const result = realtimeBatchBodySchema.safeParse(payload)
  if (!result.success) {
    return null
  }
  const events: WorkspaceRealtimeEvent[] = []
  const dropped: DroppedBatchItem[] = []
  result.data.batch.forEach((item, index) => {
    const parsed = realtimeEventEnvelopeSchema.safeParse(item)
    if (parsed.success && isWorkspaceRealtimeEvent(parsed.data)) {
      events.push(parsed.data)
      return
    }
    dropped.push(toDroppedBatchItem(item, index))
  })
  return events.length > 0 ? { events, dropped } : null
}

export default class WorkspaceParty implements Party.Server {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(readonly room: Party.Room) {}

  /**
   * Serializes `ensureReportLoopArmed`: a Durable Object opens its input gate
   * across the report fetch, so concurrent callers could both see a stale loop
   * and both re-arm.
   */
  private bootstrapLock: Promise<void> = Promise.resolve()

  /**
   * In-memory mirror of `PRESENCE_LAST_ARMED_AT_STORAGE_KEY`. A Durable Object
   * instance is single-threaded and long-lived, so once this instance has
   * seen the durable value it never needs to re-read storage to check
   * freshness — only `recordArmedAt`/`clearArmedAt` may write it, keeping it
   * in lockstep with storage.
   */
  private lastArmedAtMemo: number | undefined

  private async recordArmedAt(now: number): Promise<void> {
    await this.room.storage.put(PRESENCE_LAST_ARMED_AT_STORAGE_KEY, now)
    this.lastArmedAtMemo = now
  }

  private async clearArmedAt(): Promise<void> {
    await this.room.storage.delete(PRESENCE_LAST_ARMED_AT_STORAGE_KEY)
    this.lastArmedAtMemo = undefined
  }
  async onConnect(
    connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ) {
    const userId = request.headers.get("X-User-ID")
    if (!userId) {
      connection.close(1008, "Unauthorized")
      return
    }

    const protocolResult = realtimeProtocolSchema.safeParse(
      request.headers.get(PROTOCOL_HEADER),
    )
    const protocol = protocolResult.success
      ? protocolResult.data
      : RealtimeProtocol.v1
    connection.setState({
      protocol,
      topics: protocol === RealtimeProtocol.v2 ? null : [],
      userId,
    } satisfies WorkspaceConnectionState)

    await this.armReportLoopSerialized(userId)
  }

  /**
   * Shared by `onConnect` and the ping handler so only one caller acts on a
   * stale loop.
   */
  private async armReportLoopSerialized(seedUserId?: string): Promise<void> {
    const previousLock = this.bootstrapLock
    let releaseLock!: () => void
    this.bootstrapLock = new Promise((resolve) => {
      releaseLock = resolve
    })
    await previousLock
    try {
      await this.ensureReportLoopArmed(seedUserId)
    } finally {
      releaseLock()
    }
  }

  /**
   * Re-arms the report loop only when it is stale, and reports immediately so a
   * fresh room is never seen as "nobody online". No-op when nobody is
   * connected. The alarm is armed before awaiting the POST so a concurrent
   * caller never sees it unarmed.
   */
  private async ensureReportLoopArmed(seedUserId?: string): Promise<void> {
    const userIds = new Set(this.collectConnectedUserIds())
    if (seedUserId) {
      userIds.add(seedUserId)
    }
    if (userIds.size === 0) {
      return
    }

    const now = Date.now()
    const memoizedLastArmedAt = this.lastArmedAtMemo
    if (
      memoizedLastArmedAt !== undefined &&
      now - memoizedLastArmedAt < REPORT_LOOP_STALE_THRESHOLD_MS
    ) {
      return
    }

    const lastArmedAt = await this.room.storage.get<number>(
      PRESENCE_LAST_ARMED_AT_STORAGE_KEY,
    )
    if (lastArmedAt !== undefined) {
      this.lastArmedAtMemo = lastArmedAt
    }
    const isLoopFresh =
      lastArmedAt !== undefined &&
      now - lastArmedAt < REPORT_LOOP_STALE_THRESHOLD_MS
    if (isLoopFresh) {
      return
    }

    await this.room.storage.put(PRESENCE_WORKSPACE_ID_STORAGE_KEY, this.room.id)
    await this.recordArmedAt(now)
    await this.room.storage.setAlarm(now + PRESENCE_REPORT_INTERVAL_MS)

    await reportWorkspacePresence(this.room.id, [...userIds])
  }

  /**
   * Stops the loop once the room is empty (excluding the closing connection).
   * No offline report is sent: presence only expires via TTL. The freshness
   * marker is cleared too, or the next connect would skip re-arming.
   */
  async onClose(connection: Party.Connection) {
    const remaining = [...this.room.getConnections()].filter(
      (candidate) => candidate.id !== connection.id,
    )
    if (remaining.length === 0) {
      await this.room.storage.deleteAlarm()
      await this.clearArmedAt()
    }
  }

  /**
   * Self-heal trigger for quiet rooms that get no connect or broadcast. Only
   * verified connections may reach the arming path.
   */
  async onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Party.Connection,
  ) {
    if (typeof message !== "string") {
      return
    }

    const senderState = sender.state as WorkspaceConnectionState | null
    if (!senderState?.userId) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    const subscription = realtimeSubscriptionMessageSchema.safeParse(parsed)
    if (subscription.success) {
      if (senderState.protocol === "v2") {
        sender.setState({
          ...senderState,
          topics: [...new Set(subscription.data.topics)],
        } satisfies WorkspaceConnectionState)
      }
      return
    }

    const result = presencePingMessageSchema.safeParse(parsed)
    if (!result.success) {
      return
    }

    await this.armReportLoopSerialized()
  }

  /**
   * Runs while the room has connections; an empty room stops the loop. The next
   * alarm is scheduled before the POST so a slow or failed report never delays
   * or skips it.
   */
  async onAlarm() {
    const userIds = this.collectConnectedUserIds()
    if (userIds.length === 0) {
      return
    }

    const now = Date.now()
    await this.recordArmedAt(now)
    await this.room.storage.setAlarm(now + PRESENCE_REPORT_INTERVAL_MS)

    const workspaceId = await this.room.storage.get<string>(
      PRESENCE_WORKSPACE_ID_STORAGE_KEY,
    )
    if (workspaceId) {
      await reportWorkspacePresence(workspaceId, userIds)
    }
  }

  private collectConnectedUserIds(): string[] {
    const userIds = new Set<string>()
    for (const connection of this.room.getConnections<WorkspaceConnectionState>()) {
      const userId = connection.state?.userId
      if (userId) {
        userIds.add(userId)
      }
    }
    return [...userIds]
  }

  /**
   * Handles workspace-wide broadcast plus two control paths via query params
   * (the body format stays unchanged): `?action=revoke&userId=` closes that
   * member's connections, `?userId=` sends only to them.
   */
  async onRequest(req: Party.Request) {
    // Best-effort recovery for a stalled report loop; never blocks the request.
    this.armReportLoopSerialized().catch((error) => {
      logger.error(
        { err: error, workspaceId: this.room.id },
        "workspace presence: failed to self-heal report loop from onRequest",
      )
    })

    const url = new URL(req.url)
    const action = url.searchParams.get(ACTION_QUERY_PARAM)
    const targetUserId = url.searchParams.get(TARGET_USER_QUERY_PARAM)

    if (action === REVOKE_ACTION) {
      if (!targetUserId) {
        return new Response("Bad Request", { status: 400 })
      }
      this.closeMemberConnections(targetUserId)
      return new Response("ok", { status: 200 })
    }

    const payload: unknown = await req.json()
    const isBatch = req.headers.get(BATCH_HEADER) === "1"
    const extracted = extractWorkspaceEvents(payload, isBatch)
    if (!extracted) {
      logger.warn(
        { workspaceId: this.room.id, isBatch },
        "Rejected realtime broadcast with no deliverable events",
      )
      return new Response("Bad Request", { status: 400 })
    }
    if (extracted.dropped.length > 0) {
      logger.warn(
        {
          workspaceId: this.room.id,
          dropped: extracted.dropped,
          delivered: extracted.events.length,
        },
        "Dropped malformed or unknown events from realtime broadcast batch",
      )
    }
    const { events } = extracted

    const connections =
      targetUserId === null
        ? this.room.getConnections<WorkspaceConnectionState>()
        : this.room.getConnections<WorkspaceConnectionState>(
            toUserConnectionTag(targetUserId),
          )
    const interested = this.deliverEvents(connections, events)
    return Response.json({ interested })
  }

  private deliverEvents(
    connections: Iterable<Party.Connection<WorkspaceConnectionState>>,
    events: readonly WorkspaceRealtimeEvent[],
  ): number {
    let interested = 0
    for (const connection of connections) {
      const state = connection.state
      if (state?.protocol !== RealtimeProtocol.v2) {
        for (const event of events) {
          connection.send(JSON.stringify(event))
        }
        interested += 1
        continue
      }

      const topics = state.topics
      const matchingEvents =
        topics === null
          ? events
          : events.filter((event) =>
              REALTIME_EVENT_TOPICS[event.eventType].topics.some((topic) =>
                topics.includes(topic),
              ),
            )
      if (matchingEvents.length === 0) {
        continue
      }
      connection.send(JSON.stringify({ batch: matchingEvents }))
      interested += 1
    }
    return interested
  }

  private closeMemberConnections(userId: string): void {
    for (const connection of this.room.getConnections(
      toUserConnectionTag(userId),
    )) {
      connection.close(REVOKE_CLOSE_CODE, REVOKE_CLOSE_REASON)
    }
  }

  static async onBeforeRequest(
    req: Party.Request,
    // lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    const error = await verifyBroadcastRequest(
      req,
      "workspace",
      env.REALTIME_BROADCAST_SECRET,
    )
    return error ?? req
  }

  /**
   * Rejects tokens for another workspace or without a `userId`; the verified id
   * is passed on via a header.
   */
  static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby) {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return new Response("Unauthorized", { status: 401 })
    }

    const protocolResult = realtimeProtocolSchema
      .nullable()
      .safeParse(url.searchParams.get(PROTOCOL_QUERY_PARAM))
    if (!protocolResult.success) {
      return new Response("Bad Request", { status: 400 })
    }

    try {
      const { userId } = await verifyMemberConnectToken(
        token,
        lobby.id,
        env.REALTIME_BROADCAST_SECRET,
      )
      req.headers.set("X-User-ID", userId)
      req.headers.set(
        PROTOCOL_HEADER,
        protocolResult.data ?? RealtimeProtocol.v1,
      )
    } catch {
      return new Response("Unauthorized", { status: 401 })
    }

    return req
  }

  /**
   * Tags connections by member id so targeted send and revoke can look them up
   * directly.
   */
  getConnectionTags(
    _connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ): string[] {
    const userId = request.headers.get("X-User-ID")
    return userId ? [toUserConnectionTag(userId)] : []
  }
}
