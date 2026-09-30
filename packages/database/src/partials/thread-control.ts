import { z } from "zod"

/**
 * Channel-agnostic "who owns this conversation thread" model (WhatsApp
 * Conversation Routing today; Messenger handover can reuse it). Every rule
 * lives here so the worker, the business service and the builder cannot drift.
 */

export const threadControlStates = z.enum(["owned", "standby", "idle"])
export type ThreadControlState = z.infer<typeof threadControlStates>

export const threadControlRoles = z.enum([
  "ai_agent",
  "ctwa",
  "customer_service",
  "escalation",
  "marketing",
  "utility",
])
export type ThreadControlRole = z.infer<typeof threadControlRoles>

export const threadControlActions = z.enum(["take", "release", "pass"])
export type ThreadControlAction = z.infer<typeof threadControlActions>

export const threadControlEvents = z.enum([
  // We got the user's message as owner (Meta: the receiver becomes owner).
  "inboundReceived",
  // We got the user's message on standby.
  "standbyReceived",
  // Meta handed the thread to us.
  "controlPassed",
  // Someone took the thread from us.
  "controlTaken",
  // Our own thread_control calls.
  "taken",
  "released",
  "passed",
  // Our Service send succeeded on a non-owned thread (implicit take).
  "serviceSent",
  // Meta rejected our Service send for ownership.
  "serviceRejected",
])
export type ThreadControlEvent = z.infer<typeof threadControlEvents>

/** Strategy map: every event has exactly one resulting state. */
export const THREAD_CONTROL_TRANSITIONS: Record<
  ThreadControlEvent,
  ThreadControlState
> = {
  inboundReceived: "owned",
  controlPassed: "owned",
  taken: "owned",
  serviceSent: "owned",
  standbyReceived: "standby",
  controlTaken: "standby",
  passed: "standby",
  serviceRejected: "standby",
  released: "idle",
}

/** A thread returns to idle after 24h of WhatsApp-user inactivity. */
export const THREAD_IDLE_AFTER_MS = 24 * 60 * 60 * 1000
/** An inbox counts as multi-responder while routing traffic was seen within this window. */
export const THREAD_CONTROL_INBOX_ACTIVE_MS = 30 * 24 * 60 * 60 * 1000
/** Refresh `Inbox.threadControlSeenAt` at most once per this interval. */
export const THREAD_CONTROL_SEEN_REFRESH_MS = 24 * 60 * 60 * 1000

/** True while routing traffic was seen on the inbox within the active window. */
export function isInboxThreadControlActive(
  seenAt: Date | null,
  now: Date,
): boolean {
  if (!seenAt) {
    return false
  }
  return now.getTime() - seenAt.getTime() < THREAD_CONTROL_INBOX_ACTIVE_MS
}

/**
 * Total order used only to break a same-timestamp tie, lowest first. Meta's
 * explicit handovers outrank our own calls, which outrank inferred states.
 */
export const THREAD_CONTROL_EVENT_PRECEDENCE: readonly ThreadControlEvent[] = [
  "inboundReceived",
  "standbyReceived",
  "serviceSent",
  "serviceRejected",
  "passed",
  "released",
  "taken",
  "controlPassed",
  "controlTaken",
]

/** Events that lose a tie against `event` (strictly lower precedence). */
export function eventsOutrankedBy(
  event: ThreadControlEvent,
): ThreadControlEvent[] {
  const rank = THREAD_CONTROL_EVENT_PRECEDENCE.indexOf(event)
  return THREAD_CONTROL_EVENT_PRECEDENCE.slice(0, Math.max(rank, 0))
}

/**
 * A stored owned/standby state is idle once 24h passed since the latest of the
 * last user message and the last applied transition (`threadControlUpdatedAt`).
 * Measuring from the transition too matters when standby visibility is off:
 * a `controlTaken`/`controlPassed` can arrive on a thread whose last seen user
 * message is old, and must not resolve to idle immediately. Idle is computed,
 * never written by a cron. `null` = routing never observed; with no reference
 * time the stored state is kept.
 */
export function resolveThreadControlState(input: {
  state: ThreadControlState | null
  lastIncomingMessageAt: Date | null
  threadControlUpdatedAt: Date | null
  now: Date
}): ThreadControlState | null {
  const { state, lastIncomingMessageAt, threadControlUpdatedAt, now } = input
  if (state === null || state === "idle") {
    return state
  }
  const times = [lastIncomingMessageAt, threadControlUpdatedAt]
    .filter((time): time is Date => time !== null)
    .map((time) => time.getTime())
  if (times.length === 0) {
    return state
  }
  return now.getTime() - Math.max(...times) >= THREAD_IDLE_AFTER_MS
    ? "idle"
    : state
}

/** Only a known foreign owner blocks a Service send; templates, idle, owned and null go to Meta. */
export function isServiceSendBlocked(input: {
  state: ThreadControlState | null
  lastIncomingMessageAt: Date | null
  threadControlUpdatedAt: Date | null
  isTemplateMessage: boolean
  now: Date
}): boolean {
  if (input.isTemplateMessage) {
    return false
  }
  return resolveThreadControlState(input) === "standby"
}

/** Meta webhook timestamps have second resolution. */
export const THREAD_CONTROL_TIMESTAMP_RESOLUTION_MS = 1000

/**
 * The `occurredAt` of an event WE originate (take/release/pass, a Service
 * send, a rejected send). Truncated to whole seconds like Meta's timestamps, so
 * a Meta handover in the same second still wins the tie by precedence instead
 * of losing to our sub-second clock (e.g. our take at T+400ms vs a
 * `control_taken` stamped T).
 */
export function toThreadControlTimestamp(date: Date): Date {
  const ms = date.getTime()
  return new Date(ms - (ms % THREAD_CONTROL_TIMESTAMP_RESOLUTION_MS))
}

/** A timestamp as stored (Date), serialized through a job payload (ISO string) or absent. */
type StoredTimestamp = Date | string | null | undefined

const toDateOrNull = (value: StoredTimestamp): Date | null =>
  value ? new Date(value) : null

/**
 * The routing columns of a contact inbox, normalized for the rules above. A
 * row handed in from a queued job went through JSON (timestamps are ISO
 * strings), and a row that predates the routing columns has them `undefined`,
 * which reads as "routing never observed" (`null`).
 */
export function readThreadControlColumns(row: {
  threadControlState?: ThreadControlState | null
  lastIncomingMessageAt?: StoredTimestamp
  threadControlUpdatedAt?: StoredTimestamp
}): {
  state: ThreadControlState | null
  lastIncomingMessageAt: Date | null
  threadControlUpdatedAt: Date | null
} {
  return {
    state: row.threadControlState ?? null,
    lastIncomingMessageAt: toDateOrNull(row.lastIncomingMessageAt),
    threadControlUpdatedAt: toDateOrNull(row.threadControlUpdatedAt),
  }
}

/** An unknown (future) Meta role is stored as null, never rejected. */
export function parseThreadControlRole(
  value: unknown,
): ThreadControlRole | null {
  const parsed = threadControlRoles.safeParse(value)
  return parsed.success ? parsed.data : null
}
