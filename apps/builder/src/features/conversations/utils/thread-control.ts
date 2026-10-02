import {
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
import {
  isThreadControlChannel,
  type ThreadControlChannel,
} from "@chatbotx.io/utils/channel"
import type { useTranslations } from "next-intl"
import { THREAD_CONTROL_CHANNEL_UI } from "@/features/messages/lib/thread-control-channel-ui"
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
 * components share it.
 */
export function resolveThreadOwnerLabel(
  t: Translate,
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
  threadOwnerExpiresAt?: Date | string | null
  threadOwnerAppId?: string | null
  threadControlLastEvent?: string | null
}

export type ThreadControlView = {
  contactInboxId: string
  /** The routing-capable channel of the resolved thread. */
  channel: ThreadControlChannel
  /** Resolved (24h idle applied); never null — a null thread yields no view. */
  state: ThreadControlState
  /** Role of the current owner, `null` when unknown. */
  ownerRole: ThreadControlRole | null
  /**
   * App id of the current owner as the channel reported it, `null` when
   * unknown. Propagated for surfaces that need it; the owner label stays
   * generic because the platform's own app id is server config.
   */
  ownerAppId: string | null
  updatedAt: Date | null
  /** Release is offered while this app owns the thread and the channel supports it. */
  canRelease: boolean
  /**
   * Pass is offered while this app owns the thread (or holds it idle on a
   * channel that can pass from idle). Hidden when this app is itself the
   * escalation partner (Meta forbids it) or the channel cannot pass.
   */
  canPass: boolean
  /** The composer is locked while another responder owns the thread on its channel. */
  isLocked: boolean
  /**
   * A standby thread the AI agent (AI hand-over) owns on an inline-reply channel
   * (`aiStandbyInlineReply`, e.g. Messenger). The locked banner still shows,
   * but its "Take over" only reveals the composer; the next send then takes the
   * thread over and rides the HUMAN_AGENT tag. Implies `isLocked` until
   * revealed.
   */
  inlineReplyTakesOver: boolean
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
 * The contact inbox whose routing the conversation shows. A conversation may
 * hold several routing-capable inboxes (e.g. two channels of the same
 * contact): the one the composer sends through wins, so its lock and panel
 * describe the thread the agent is replying on. Without a matching composer
 * channel the first inbox whose routing was observed is used, else the first.
 */
const pickRoutingContactInbox = <
  TContactInbox extends ThreadControlContactInbox,
>(
  contactInboxes: TContactInbox[],
  now: Date,
  composerChannel: string | null | undefined,
): TContactInbox | undefined => {
  const candidates = contactInboxes.filter((contactInbox) =>
    isThreadControlChannel(contactInbox.channel),
  )
  const composerInbox =
    composerChannel && isThreadControlChannel(composerChannel)
      ? findContactInboxByChannel(
          { contactInboxes: candidates },
          composerChannel,
        )
      : undefined
  return (
    composerInbox ??
    candidates.find(
      (contactInbox) =>
        resolveThreadControlState({
          ...readThreadControlColumns(contactInbox),
          now,
        }) !== null,
    ) ??
    candidates[0]
  )
}

const resolveIdleAt = (
  state: ThreadControlState,
  expiresAt: Date | null,
  referenceTimes: number[],
): number | null => {
  if (state === "idle") {
    return null
  }
  if (expiresAt) {
    return expiresAt.getTime()
  }
  return referenceTimes.length > 0
    ? Math.max(...referenceTimes) + THREAD_IDLE_AFTER_MS
    : null
}

/**
 * Resolves the routing view of a conversation's thread on a routing-capable
 * channel (`isThreadControlChannel`), or `null` when there is no such inbox or
 * routing was never observed (today's UI). `composerChannel` is the channel
 * the message box sends through: the lock applies only when that is the
 * channel of the resolved thread, so a reply on one channel is never blocked
 * by another channel's routing.
 */
export function resolveThreadControlView(
  conversation: ConversationWithInboxes | null | undefined,
  now: Date,
  composerChannel?: string | null,
): ThreadControlView | null {
  const contactInbox = pickRoutingContactInbox(
    conversation?.contactInboxes ?? [],
    now,
    composerChannel,
  )
  if (!(contactInbox && isThreadControlChannel(contactInbox.channel))) {
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
  // A channel expiry replaces the 24h boundary (same rule as the resolver).
  const idleAt = resolveIdleAt(
    state,
    columns.threadOwnerExpiresAt,
    referenceTimes,
  )

  const capabilities = THREAD_CONTROL_CHANNEL_UI[contactInbox.channel]

  // The composer only acts on the thread it sends through.
  const composerOwnsThread =
    isThreadControlChannel(composerChannel) &&
    composerChannel === contactInbox.channel
  // AI hand-over (ai_agent) holds a standby thread on a channel that lets a human
  // reply inline. The banner still shows first: "Take over" reveals the
  // composer (no Meta call yet), then the first send takes the thread over and
  // rides the HUMAN_AGENT tag (see the locked composer + message-input).
  const inlineReplyTakesOver =
    state === "standby" &&
    ownerRole === "ai_agent" &&
    capabilities.aiStandbyInlineReply &&
    composerOwnsThread

  return {
    contactInboxId: contactInbox.id,
    channel: contactInbox.channel,
    state,
    ownerRole,
    ownerAppId: contactInbox.threadOwnerAppId ?? null,
    updatedAt: columns.threadControlUpdatedAt,
    canRelease: state === "owned" && capabilities.supportsRelease,
    canPass:
      capabilities.supportsPass &&
      (state === "owned" || (state === "idle" && capabilities.passFromIdle)) &&
      ownerRole !== "escalation",
    isLocked: state === "standby" && composerOwnsThread,
    inlineReplyTakesOver,
    idleAt,
    now,
  }
}

/**
 * The contact inbox whose thread the header "return to the AI" would pass: the
 * first routing-capable inbox on a channel whose pass target is the AI agent
 * (`passTarget: "aiAgent"`). Chosen by channel capability, not by which
 * routing view the conversation shows, so another channel's observed routing
 * (e.g. an owned WhatsApp thread) never hides it.
 */
export function findAiHandoverContactInbox<
  TContactInbox extends ThreadControlContactInbox,
>(
  conversation: { contactInboxes: TContactInbox[] } | null | undefined,
): TContactInbox | undefined {
  return conversation?.contactInboxes.find(
    (contactInbox) =>
      isThreadControlChannel(contactInbox.channel) &&
      THREAD_CONTROL_CHANNEL_UI[contactInbox.channel].passTarget === "aiAgent",
  )
}

/**
 * Whether the header "return to the AI" is offered for `contactInbox`, given
 * the routing view resolved for that inbox alone. Offered while this app can
 * pass (`view.canPass`) and for a thread whose routing was never observed (no
 * view): on such a channel this app is the primary receiver and holds the
 * thread, so returning it is valid (v1 shows it for every such thread). The AI
 * already owning the thread, or any other responder in standby, hides it.
 */
export function canReturnToAiAgent(
  contactInbox: Pick<ThreadControlContactInbox, "channel"> | undefined,
  view: ThreadControlView | null,
): boolean {
  if (!(contactInbox && isThreadControlChannel(contactInbox.channel))) {
    return false
  }
  return view
    ? view.canPass
    : THREAD_CONTROL_CHANNEL_UI[contactInbox.channel].passFromIdle
}

/** The routing fields a thread-control snapshot patches onto a contact inbox. */
export type ThreadControlSnapshotPatch = {
  contactInboxId: string
  threadControlState: ThreadControlState | null
  threadOwnerRole: string | null
  threadControlUpdatedAt: Date | string | null
  threadOwnerExpiresAt?: Date | string | null
  threadOwnerAppId?: string | null
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
