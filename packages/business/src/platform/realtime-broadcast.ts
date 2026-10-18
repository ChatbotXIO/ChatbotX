import type {
  RealtimeEventData,
  RealtimeGuestEventData,
  RealtimeTargetedEventData,
} from "@chatbotx.io/realtime-protocol"
import {
  RealtimeEventType,
  realtimeWorkspaceEventEnvelopeSchema,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"
import {
  flushRealtimeRelayMetrics,
  recordRealtimeRelayBackpressure,
  recordRealtimeRelayError,
  recordRealtimeRelayEvent,
  recordRealtimeRelayFlush,
  resetRealtimeRelayMetricsForTests,
} from "./realtime-relay-metrics"
import {
  drainInFlightRealtimeStreamPublishes,
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests,
  retryWithLinearBackoff,
} from "./realtime-stream-publisher"

const WORKSPACE_REALTIME_COALESCE_MS = 25
const WORKSPACE_REALTIME_MAX_EVENTS = 64
const WORKSPACE_REALTIME_MAX_BYTES = 256 * 1024
const WORKSPACE_REALTIME_MAX_APPEND_DEPTH = 8

const serializeWorkspaceEventsRecord = (
  workspaceId: string,
  serializedEvents: readonly string[],
): string => {
  const events = serializedEvents.join(",")
  return `{"events":[${events}],"kind":"workspace-events","workspaceId":${JSON.stringify(workspaceId)}}`
}
const IMMEDIATE_FLUSH_EVENT_TYPES: Partial<
  Record<RealtimeEventData["eventType"], true>
> = {
  [RealtimeEventType.conversationAssigned]: true,
  [RealtimeEventType.whatsappCallClaimedElsewhere]: true,
  [RealtimeEventType.whatsappCallPermissionUpdated]: true,
  [RealtimeEventType.whatsappCallTransportEnded]: true,
}

type PendingWorkspaceRealtimeEvents = {
  byteLength: number
  delivery: PromiseWithResolvers<void>
  serializedEvents: string[]
  timer: NodeJS.Timeout
}

const pendingByWorkspace = new Map<string, PendingWorkspaceRealtimeEvents>()
const inFlightByWorkspace = new Map<string, Promise<void>>()
const appendDepthByWorkspace = new Map<string, number>()

const createPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): PendingWorkspaceRealtimeEvents => {
  const pending: PendingWorkspaceRealtimeEvents = {
    byteLength: Buffer.byteLength(
      serializeWorkspaceEventsRecord(workspaceId, []),
    ),
    delivery: Promise.withResolvers<void>(),
    serializedEvents: [],
    timer: setTimeout(
      () =>
        flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined),
      WORKSPACE_REALTIME_COALESCE_MS,
    ),
  }
  pendingByWorkspace.set(workspaceId, pending)
  return pending
}

/**
 * Flushes one workspace's coalesced event batch. Used for both the
 * coalescing flush timer and `flushAllPendingWorkspaceRealtimeEvents`'s
 * shutdown drain. Rejects when Redis cannot append it.
 */
const flushPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): Promise<void> => {
  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    return Promise.resolve()
  }

  pendingByWorkspace.delete(workspaceId)
  clearTimeout(pending.timer)
  if (pending.serializedEvents.length === 0) {
    return Promise.resolve()
  }

  recordRealtimeRelayFlush(pending.serializedEvents.length)

  const previousAppend =
    inFlightByWorkspace.get(workspaceId) ?? Promise.resolve()
  appendDepthByWorkspace.set(
    workspaceId,
    (appendDepthByWorkspace.get(workspaceId) ?? 0) + 1,
  )
  const append = previousAppend
    .catch(() => undefined)
    .then(() =>
      publishSerializedRealtimeStreamRecord(
        workspaceId,
        serializeWorkspaceEventsRecord(workspaceId, pending.serializedEvents),
      ),
    )
  append.then(
    () => {
      pending.delivery.resolve()
    },
    (error) => {
      recordRealtimeRelayError()
      pending.delivery.reject(error)
    },
  )

  inFlightByWorkspace.set(workspaceId, append)
  append
    .catch(() => undefined)
    .then(() => {
      const remainingDepth = (appendDepthByWorkspace.get(workspaceId) ?? 1) - 1
      if (remainingDepth === 0) {
        appendDepthByWorkspace.delete(workspaceId)
      } else {
        appendDepthByWorkspace.set(workspaceId, remainingDepth)
      }
      if (inFlightByWorkspace.get(workspaceId) === append) {
        inFlightByWorkspace.delete(workspaceId)
      }
    })
  return append
}

export const resetRealtimePublishStateForTests = (): void => {
  for (const pending of pendingByWorkspace.values()) {
    clearTimeout(pending.timer)
    pending.delivery.resolve()
  }
  pendingByWorkspace.clear()
  inFlightByWorkspace.clear()
  appendDepthByWorkspace.clear()
  resetRealtimeStreamPublisherForTests()
  resetRealtimeRelayMetricsForTests()
}

/**
 * Drains every workspace's coalesced batch and in-flight append independently
 * so one failed workspace does not hide another workspace's delivery result.
 */
export const flushAllPendingWorkspaceRealtimeEvents =
  async (): Promise<void> => {
    const failures = new Map<string, unknown>()
    const recordFailure = (
      workspaceId: string,
      reason: unknown,
      message: string,
    ): void => {
      if (failures.has(workspaceId)) {
        return
      }
      failures.set(workspaceId, reason)
      logger.error({ err: reason, workspaceId }, message)
    }

    while (pendingByWorkspace.size > 0 || inFlightByWorkspace.size > 0) {
      const pendingWorkspaceIds = [...pendingByWorkspace.keys()]
      const flushResults = await Promise.allSettled(
        pendingWorkspaceIds.map((workspaceId) =>
          flushPendingWorkspaceRealtimeEvents(workspaceId),
        ),
      )
      for (const [index, result] of flushResults.entries()) {
        if (result.status === "rejected") {
          recordFailure(
            pendingWorkspaceIds[index] ?? "",
            result.reason,
            "Failed to flush pending realtime events on shutdown",
          )
        }
      }

      const inFlightEntries = [...inFlightByWorkspace.entries()]
      const inFlightResults = await Promise.allSettled(
        inFlightEntries.map(([, append]) => append),
      )
      for (const [index, result] of inFlightResults.entries()) {
        if (result.status === "rejected") {
          recordFailure(
            inFlightEntries[index]?.[0] ?? "",
            result.reason,
            "Failed to drain an in-flight realtime append on shutdown",
          )
        }
      }
    }

    try {
      await drainInFlightRealtimeStreamPublishes()
    } catch (error) {
      recordFailure(
        "direct",
        error,
        "Failed to drain direct realtime publishes on shutdown",
      )
    }
    flushRealtimeRelayMetrics(true)
    if (failures.size > 0) {
      throw new AggregateError(
        [...failures.values()],
        `${failures.size} realtime flush(es) failed during shutdown`,
      )
    }
  }

/**
 * Coalesces workspace events for a short interval while preserving append order
 * per workspace. Resolves only after the corresponding Redis stream append.
 */
export const publishWorkspaceRealtimeEvent = (
  workspaceId: string,
  event: RealtimeEventData,
): Promise<void> => {
  const parseResult = realtimeWorkspaceEventEnvelopeSchema.safeParse(event)
  if (!parseResult.success) {
    const error = new Error("Invalid workspace realtime event")
    logger.warn(
      { err: error, issues: parseResult.error.issues, workspaceId },
      "Rejected invalid workspace realtime event",
    )
    return Promise.reject(error)
  }

  flushRealtimeRelayMetrics(false)
  if (
    (appendDepthByWorkspace.get(workspaceId) ?? 0) >=
    WORKSPACE_REALTIME_MAX_APPEND_DEPTH
  ) {
    const error = new Error("Realtime workspace append backlog exceeded")
    if (recordRealtimeRelayBackpressure()) {
      logger.warn(
        { appendDepth: appendDepthByWorkspace.get(workspaceId), workspaceId },
        "Realtime workspace append backlog exceeded",
      )
    }
    return Promise.reject(error)
  }
  let pending =
    pendingByWorkspace.get(workspaceId) ??
    createPendingWorkspaceRealtimeEvents(workspaceId)
  const serializedEvent = JSON.stringify(event)
  const serializedEventBytes = Buffer.byteLength(serializedEvent)
  recordRealtimeRelayEvent(event.eventType, serializedEventBytes)
  const separatorBytes = pending.serializedEvents.length > 0 ? 1 : 0
  const wouldExceedBytes =
    pending.byteLength + separatorBytes + serializedEventBytes >
    WORKSPACE_REALTIME_MAX_BYTES
  const wouldExceedCount =
    pending.serializedEvents.length + 1 > WORKSPACE_REALTIME_MAX_EVENTS

  if (wouldExceedBytes || wouldExceedCount) {
    flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined)
    pending = createPendingWorkspaceRealtimeEvents(workspaceId)
  }

  const nextSeparatorBytes = pending.serializedEvents.length > 0 ? 1 : 0
  pending.serializedEvents.push(serializedEvent)
  pending.byteLength += nextSeparatorBytes + serializedEventBytes
  const delivery = pending.delivery.promise

  if (
    IMMEDIATE_FLUSH_EVENT_TYPES[event.eventType] === true ||
    pending.serializedEvents.length === WORKSPACE_REALTIME_MAX_EVENTS
  ) {
    flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined)
  }
  return delivery
}

export const queueMessageCreatedEvent = (
  workspaceId: string,
  message: Extract<
    RealtimeEventData,
    { eventType: typeof RealtimeEventType.messageCreated }
  >["data"],
  conversation: Parameters<typeof routeForConversation>[0],
  inboxId?: string,
): void => {
  queueWorkspaceRealtimeEvent(workspaceId, {
    eventType: RealtimeEventType.messageCreated,
    data: message,
    route: routeForConversation(conversation, inboxId),
  })
}

/**
 * Queues a workspace event without making the caller wait for stream delivery.
 * Redis append failures remain visible in logs.
 */
export const queueWorkspaceRealtimeEvent = (
  workspaceId: string,
  event: RealtimeEventData,
): void => {
  publishWorkspaceRealtimeEvent(workspaceId, event).catch((error) => {
    logger.error(
      { err: error, eventType: event.eventType, workspaceId },
      "Failed to publish realtime event",
    )
  })
}

/**
 * Delivers an event to one workspace member's active realtime connections.
 * Resolves after Redis accepts the command and rejects on append failure.
 */
export const publishWorkspaceMemberRealtimeEvent = async (
  args: { workspaceId: string; userId: string },
  event: RealtimeTargetedEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    kind: "member-send",
    workspaceId: args.workspaceId,
    userId: args.userId,
  })
}

const REVOKE_RETRY_ATTEMPTS = 3
const REVOKE_RETRY_DELAY_MS = 250
const REVOKE_RETRY_JOB_ATTEMPTS = 5
const REVOKE_RETRY_JOB_DELAY_MS = 1000

type WorkspaceMemberRealtimeConnectionRevocationArgs = {
  reason: "deleted" | "reauth"
  revokedAtMs?: number
  userId: string
  workspaceId: string
}

/**
 * Records the reconnect marker and sends a control record to close current
 * connections. Throws after its bounded Redis retry budget is exhausted.
 */
const revokeWorkspaceMemberRealtimeConnections = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs,
): Promise<void> => {
  const revokedAtMs = args.revokedAtMs ?? Date.now()
  await retryWithLinearBackoff(
    async () => {
      await markRealtimeMemberRevoked(
        args.workspaceId,
        args.userId,
        revokedAtMs,
      )
      await publishRealtimeStreamRecord({
        kind: "member-revoke",
        reason: args.reason,
        revokedAtMs,
        workspaceId: args.workspaceId,
        userId: args.userId,
      })
    },
    {
      attempts: REVOKE_RETRY_ATTEMPTS,
      baseDelayMs: REVOKE_RETRY_DELAY_MS,
      workspaceId: args.workspaceId,
    },
  )
}

/**
 * Runs the durable-retry attempt. It intentionally throws so BullMQ retries
 * the job instead of enqueuing a recursive replacement job.
 */
export const retryWorkspaceMemberRealtimeConnections = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs,
): Promise<void> => {
  await revokeWorkspaceMemberRealtimeConnections(args)
}

const enqueueWorkspaceMemberRealtimeConnectionRevocationRetry = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs,
): Promise<void> => {
  try {
    await defaultQueue.add(
      DefaultJobAction.retryRealtimeMemberRevoke,
      {
        type: DefaultJobAction.retryRealtimeMemberRevoke,
        data: {
          reason: args.reason,
          revokedAtMs: args.revokedAtMs ?? Date.now(),
          userId: args.userId,
          workspaceId: args.workspaceId,
        },
      },
      {
        attempts: REVOKE_RETRY_JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: REVOKE_RETRY_JOB_DELAY_MS,
        },
        removeOnComplete: true,
      },
    )
  } catch (error) {
    logger.error(
      { err: error, userId: args.userId, workspaceId: args.workspaceId },
      "Failed to enqueue realtime member connection revoke retry",
    )
  }
}

/**
 * Best-effort revocation that never throws. A failed immediate revoke is
 * retried durably by the default worker.
 */
export const tryRevokeWorkspaceMemberRealtimeConnections = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs & {
    errorMessage: string
  },
): Promise<boolean> => {
  const revocationArgs = {
    ...args,
    revokedAtMs: Date.now(),
  }
  try {
    await retryWorkspaceMemberRealtimeConnections(revocationArgs)
    return true
  } catch (error) {
    logger.error(
      { err: error, userId: args.userId, workspaceId: args.workspaceId },
      args.errorMessage,
    )
    await enqueueWorkspaceMemberRealtimeConnectionRevocationRetry(
      revocationArgs,
    )
    return false
  }
}

/** Publishes an event to a guest conversation's active realtime connections. */
export const publishGuestRealtimeEvent = async (
  args: { workspaceId: string; guestConversationId: string },
  event: RealtimeGuestEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    guestConversationId: args.guestConversationId,
    kind: "guest-event",
    workspaceId: args.workspaceId,
  })
}
