import {
  channelTypes,
  eventsOutrankedBy,
  parseThreadControlRole,
  readThreadControlColumns,
  resolveThreadControlState,
  THREAD_IDLE_AFTER_MS,
  type ThreadControlEvent,
  type ThreadControlRole,
  type ThreadControlState,
  threadControlEvents,
} from "@chatbotx.io/database/partials"
import type { useTranslations } from "next-intl"
import type { ConversationContactInboxResource } from "../schema/resource"
import { findContactInboxByChannel } from "./contact-inbox"

/**
 * Conversation routing (thread control) as the inbox sees it. One pure
 * resolver shared by the list pill, header, composer lock and side panel, so
 * every surface agrees on the state for the same conversation and clock.
 */

type Translate = ReturnType<typeof useTranslations>

const ROLE_LABEL_KEYS = {
  ai_agent: "conversationRouting.roles.ai_agent",
  ctwa: "conversationRouting.roles.ctwa",
  customer_service: "conversationRouting.roles.customer_service",
  escalation: "conversationRouting.roles.escalation",
  marketing: "conversationRouting.roles.marketing",
  utility: "conversationRouting.roles.utility",
} as const satisfies Record<ThreadControlRole, string>

/**
 * Owner label strategy: this app owning the thread shows a brand-neutral
 * "you" (white-label — the product name never leaks into routing copy),
 * `ai_agent` is "Meta AI", any other role "Partner · <role>", an unknown role
 * just "Partner". Pure, so the list preview (outside React hooks) and the
 * components share it. `brand` is kept for signature compatibility with callers
 * that still thread it through, but is no longer shown.
 */
export function resolveThreadOwnerLabel(
  t: Translate,
  _brand: string,
  state: ThreadControlState,
  role: ThreadControlRole | null,
): string {
  if (state === "owned") {
    return t("conversationRouting.owner.self")
  }
  if (role === "ai_agent") {
    return t("conversationRouting.owner.metaAi")
  }
  if (role) {
    return t("conversationRouting.owner.partnerWithRole", {
      role: t(ROLE_LABEL_KEYS[role]),
    })
  }
  return t("conversationRouting.owner.partner")
}

/** The routing fields of a contact inbox; timestamps may be strings after realtime/JSON. */
export type ThreadControlContactInbox = Pick<
  ConversationContactInboxResource,
  "id" | "channel" | "lastIncomingMessageAt"
> & {
  threadControlState?: ThreadControlState | null
  threadOwnerRole?: string | null
  threadControlUpdatedAt?: Date | string | null
  threadControlLastEvent?: string | null
}

export type ThreadControlView = {
  contactInboxId: string
  /** Resolved (24h idle applied); never null — a null thread yields no view. */
  state: ThreadControlState
  /** Role of the current owner, `null` when unknown. */
  ownerRole: ThreadControlRole | null
  updatedAt: Date | null
  /** Release is offered while this app owns the thread. */
  canRelease: boolean
  /** Pass is hidden when this app is itself the escalation partner (Meta forbids it). */
  canPass: boolean
  /** The WhatsApp composer is locked while another responder owns the thread. */
  isLocked: boolean
  /** Next instant the resolved state can change on its own (24h idle boundary). */
  idleAt: number | null
  /**
   * The clock the view was resolved against. `useThreadControl` ticks it each
   * minute, so relative times ("5 minutes ago") reuse it instead of a second
   * timer, and next-intl never has to fall back to its own `now`.
   */
  now: Date
}

type ConversationWithInboxes = {
  contactInboxes: ThreadControlContactInbox[]
}

const toTime = (value: Date | null): number | null =>
  value ? value.getTime() : null

/**
 * Resolves the routing view of a conversation's WhatsApp thread, or `null`
 * when there is no WhatsApp inbox or routing was never observed (today's UI).
 * `composerChannel` is the channel the message box sends through: the lock
 * applies only when that is WhatsApp, so a Messenger reply is never blocked
 * by WhatsApp routing.
 */
export function resolveThreadControlView(
  conversation: ConversationWithInboxes | null | undefined,
  now: Date,
  composerChannel?: string | null,
): ThreadControlView | null {
  const contactInbox = findContactInboxByChannel(
    conversation,
    channelTypes.enum.whatsapp,
  )
  if (!contactInbox) {
    return null
  }
  const columns = readThreadControlColumns(contactInbox)
  const state = resolveThreadControlState({ ...columns, now })
  if (state === null) {
    return null
  }

  const ownerRole = parseThreadControlRole(contactInbox.threadOwnerRole)
  const referenceTimes = [
    toTime(columns.lastIncomingMessageAt),
    toTime(columns.threadControlUpdatedAt),
  ].filter((time): time is number => time !== null)
  const idleAt =
    state !== "idle" && referenceTimes.length > 0
      ? Math.max(...referenceTimes) + THREAD_IDLE_AFTER_MS
      : null

  return {
    contactInboxId: contactInbox.id,
    state,
    ownerRole,
    updatedAt: columns.threadControlUpdatedAt,
    canRelease: state === "owned",
    canPass: state === "owned" && ownerRole !== "escalation",
    isLocked:
      state === "standby" && composerChannel === channelTypes.enum.whatsapp,
    idleAt,
    now,
  }
}

/** The routing fields a thread-control snapshot patches onto a contact inbox. */
export type ThreadControlSnapshotPatch = {
  contactInboxId: string
  threadControlState: ThreadControlState | null
  threadOwnerRole: string | null
  threadControlUpdatedAt: Date | string | null
  threadControlLastEvent: string | null
}

const toDateOrNull = (value: Date | string | null | undefined): Date | null =>
  value ? new Date(value) : null

/** A known routing event, or `null` (unknown value or a store from before the column). */
export function parseThreadControlEvent(
  value: string | null | undefined,
): ThreadControlEvent | null {
  const parsed = threadControlEvents.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Same-second tie, decided exactly like the server's guarded write
 * (`applyThreadControlTransition`): the incoming snapshot wins when its event
 * outranks the stored one (`eventsOutrankedBy`, the shared precedence order)
 * or is the same event (idempotent redelivery). Without both events (a store
 * or payload from before the column) the incoming snapshot is applied, as
 * before.
 */
const winsSameSecondTie = (
  storedEvent: ThreadControlEvent | null,
  incomingEvent: ThreadControlEvent | null,
): boolean => {
  if (!(storedEvent && incomingEvent)) {
    return true
  }
  return (
    storedEvent === incomingEvent ||
    eventsOutrankedBy(incomingEvent).includes(storedEvent)
  )
}

/**
 * True when `snapshot` must not overwrite the stored routing columns: it is
 * older than what the store holds (a late realtime event after an action
 * result, or the reverse), or it is from the same second and loses the tie
 * by event precedence (e.g. our `taken` vs Meta's `controlTaken` at T).
 */
export function isStaleThreadControlSnapshot(
  stored: Pick<
    ThreadControlContactInbox,
    "threadControlUpdatedAt" | "threadControlLastEvent"
  >,
  snapshot: Pick<
    ThreadControlSnapshotPatch,
    "threadControlUpdatedAt" | "threadControlLastEvent"
  >,
): boolean {
  const storedAt = toDateOrNull(stored.threadControlUpdatedAt)
  if (!storedAt) {
    return false
  }
  const incomingAt = toDateOrNull(snapshot.threadControlUpdatedAt)
  if (!incomingAt || incomingAt.getTime() < storedAt.getTime()) {
    return true
  }
  if (incomingAt.getTime() > storedAt.getTime()) {
    return false
  }
  return !winsSameSecondTie(
    parseThreadControlEvent(stored.threadControlLastEvent),
    parseThreadControlEvent(snapshot.threadControlLastEvent),
  )
}
