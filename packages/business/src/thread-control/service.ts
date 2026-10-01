import {
  isInboxThreadControlActive,
  parseThreadControlRole,
  readThreadControlColumns,
  resolveThreadControlState,
  THREAD_CONTROL_SEEN_REFRESH_MS,
  THREAD_CONTROL_TRANSITIONS,
  type ThreadControlAction,
  type ThreadControlEvent,
  type ThreadControlRole,
  type ThreadControlState,
  threadControlRoles,
  toThreadControlTimestamp,
} from "@chatbotx.io/database/partials"
import {
  contactInboxRepository,
  createMessageRepository,
  inboxRepository,
} from "@chatbotx.io/database/repositories"
import type {
  ContactInboxModel,
  InboxModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type {
  ThreadControlContext,
  ThreadControlDelivery,
  ThreadOwnerResult,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { supportsArchiveRelease } from "@chatbotx.io/utils/channel"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { contactInboxService } from "../contact-inbox/service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { publishToWorkspaceParty } from "../platform/realtime-broadcast"
import {
  isRoutingTraffic,
  resolveThreadControlActivityText,
  THREAD_CONTROL_ACTIVITY_TYPE,
  THREAD_CONTROL_CONTEXT_SOURCE_ID_PREFIX,
  THREAD_CONTROL_CONTEXT_TYPE,
  THREAD_CONTROL_DELIVERY_KEY,
  THREAD_CONTROL_PROMOTED_KEY,
  THREAD_CONTROL_SOURCE_ID_PREFIX,
  THREAD_CONTROL_STANDBY_DELIVERY,
} from "./constants"

/** What the take/release/pass action returns and the realtime event carries. */
export type ThreadControlSnapshot = {
  contactInboxId: string
  threadControlState: ThreadControlState | null
  threadOwnerRole: string | null
  /** Owner app id for channels that name owners by app id; null otherwise. */
  threadOwnerAppId: string | null
  threadControlUpdatedAt: Date | null
  /** Channel-reported expiry of a standby thread; null when none is known. */
  threadOwnerExpiresAt: Date | null
  /** The event behind the state: breaks an equal-timestamp tie on the client. */
  threadControlLastEvent: ThreadControlEvent | null
}

export type RecordThreadControlEventInput = {
  workspaceId: string
  /**
   * `threadControlSeenAt` decides whether the once-a-day "routing traffic
   * seen" write is due. A caller that never loaded the inbox passes `null`;
   * the write is throttled in SQL, so that costs one guarded no-op UPDATE.
   */
  inbox: Pick<InboxModel, "id" | "threadControlSeenAt">
  contactInbox: ContactInboxModel
  conversationId: string
  event: ThreadControlEvent
  /** Role of the owner AFTER the event; unknown roles are stored as null. */
  ownerRole?: string | null
  /** Role of the owner BEFORE a handover, for the timeline divider. */
  previousOwnerRole?: string | null
  /** App id of the owner AFTER the event (app-id channels); null/absent otherwise. */
  ownerAppId?: string | null
  /** App id of the owner BEFORE the event (the return target); null/absent otherwise. */
  previousOwnerAppId?: string | null
  /**
   * Channel-reported expiry to store. Absent: derived from the event (a standby
   * result keeps the stored value, an owned/idle result clears it). Only
   * `syncThreadOwner` passes a Date.
   */
  threadOwnerExpiresAt?: Date | null
  /** Meta event time for webhook events, `now` for our own calls. */
  occurredAt: Date
  /**
   * Set when this event promotes the owner copy of a message first stored
   * from its standby copy recorded at this time (equal to `occurredAt`: the
   * event time is NOT advanced, so a same-second handover is never
   * leapfrogged). The standby copy is superseded through a dedicated write that
   * applies only while the row is still that copy; anything else falls back to
   * the normal guard (an exact redelivery is idempotent, a handover wins).
   */
  supersedesStandbyAt?: Date
  context?: ThreadControlContext
  handoverNote?: string
}

export type RecordThreadControlEventResult = {
  /** False when the guarded write rejected the event as stale. */
  eventApplied: boolean
  /** True when the resolved state or owner role actually changed. */
  stateChanged: boolean
  /**
   * True when the row already held this exact event (same event, same time)
   * before the write: a webhook redelivery or a retried job. It is still
   * applied (idempotent), but one-shot side effects must not run again.
   */
  isRedelivery: boolean
  /** The row after the write; `null` when the event was stale. */
  row: ContactInboxModel | null
}

export type RecordInboundDeliveryInput = Omit<
  RecordThreadControlEventInput,
  | "event"
  | "ownerRole"
  | "previousOwnerRole"
  | "previousOwnerAppId"
  | "handoverNote"
> & {
  delivery: ThreadControlDelivery
  /**
   * Owner app id the channel reported on a `standby` delivery; ignored for an
   * `owner` delivery (we own the thread, which needs no app id). Absent/null
   * for channels that do not name owners by app id.
   */
  ownerAppId?: string | null
  /**
   * Owner role the channel reported on a `standby` delivery (ignored for an
   * owner delivery, like the app id).
   */
  ownerRole?: ThreadControlRole | null
  /** Injected for tests; defaults to the wall clock. */
  now?: Date
}

/**
 * What the channel reports after accepting an action: the owner role of the
 * thread afterwards (`null` = no owner / not expressible as a role). The
 * channel decides it, so no channel rule lives in this shared service.
 */
export type ThreadControlChannelResult = {
  ownerRole: ThreadControlRole | null
  /** Owner app id after the action, for channels that name owners by app id. */
  ownerAppId?: string | null
}

/**
 * The channel side of take/release/pass, supplied by the caller. `packages/
 * business` cannot import the channel registry (which imports this package),
 * so the registry-aware wrapper (`@chatbotx.io/channel-registry/thread-control`)
 * resolves the integration and hands its handler in here.
 */
export type ThreadControlChannelCall = (
  contactInbox: ContactInboxModel,
) => Promise<ThreadControlChannelResult>

export type RequestThreadControlActionInput = {
  workspaceId: string
  contactInboxId: string
  conversationId: string
  action: ThreadControlAction
  /** The owner role after our action is whatever the channel call returns. */
  applyOnChannel: ThreadControlChannelCall
  /**
   * Ownership version (`threadControlUpdatedAt`) the caller validated. When
   * given and the row read by `requestAction` differs, the channel call is
   * skipped and the current snapshot returned (the thread changed hands
   * between the caller's check and this read).
   */
  expectedThreadControlUpdatedAt?: Date | null
}

/**
 * The channel side of an owner sync: asks the channel who owns the thread.
 * Resolves `null` when the channel cannot answer (no owner-query API), which is
 * "cannot sync", never "no owner".
 */
export type ThreadOwnerFetcher = (
  contactInbox: ContactInboxModel,
) => Promise<ThreadOwnerResult | null>

export type SyncThreadOwnerInput = {
  workspaceId: string
  contactInbox: ContactInboxModel
  conversationId: string
  fetchOwner: ThreadOwnerFetcher
  /**
   * OUR OWN app id and the automated-assistant app id, resolved by the channel
   * side. Optional: when omitted they are taken from the `fetchOwner` result
   * (the channel reports its own identities alongside the owner).
   */
  ownAppId?: string | null
  businessAiAppId?: string | null
}

/** Who the channel says holds the thread, relative to us. */
export type ThreadOwnerKind = "self" | "businessAi" | "partner" | "none"

/** Pure: classifies the channel's owner app id against the caller's identities. */
export const classifyThreadOwner = (
  ownerAppId: string | null,
  ids: { ownAppId: string | null; businessAiAppId: string | null },
): ThreadOwnerKind | "unknown" => {
  if (ownerAppId === null) {
    return "none"
  }
  if (ids.ownAppId === null) {
    // Without our own id an app id cannot be told apart from ours: no guess.
    return "unknown"
  }
  if (ownerAppId === ids.ownAppId) {
    return "self"
  }
  return ownerAppId === ids.businessAiAppId ? "businessAi" : "partner"
}

/** Our own action → the event recorded once the channel accepted it. */
const ACTION_EVENTS: Record<ThreadControlAction, ThreadControlEvent> = {
  take: "taken",
  release: "released",
  pass: "passed",
}

/** Activity rows: a divider per state change, an optional context card. */
type RoutingMessageKind = "activity" | "context"

/**
 * A message stored from a standby delivery that no owner delivery has promoted
 * yet. Pure (no query), so the inbound pipeline can record the ownership
 * transition before it spends the one-shot promotion claim.
 */
export const isUnpromotedStandbyCopy = (
  message: Pick<MessageModel, "contentAttributes">,
): boolean => {
  const attributes = message.contentAttributes as Record<string, unknown> | null
  return (
    attributes?.[THREAD_CONTROL_DELIVERY_KEY] ===
      THREAD_CONTROL_STANDBY_DELIVERY &&
    attributes[THREAD_CONTROL_PROMOTED_KEY] === undefined
  )
}

/** Resolved state of a row, which may have come through a job payload. */
const resolveStoredState = (
  contactInbox: ContactInboxModel,
  now: Date,
): ThreadControlState | null =>
  resolveThreadControlState({ ...readThreadControlColumns(contactInbox), now })

/** A rejected promise, kept so later cleanup can run before it is rethrown. */
type SettledFailure = { error: unknown }

const settle = (promise: Promise<unknown>): Promise<SettledFailure | null> =>
  promise.then(
    () => null,
    (error: unknown) => ({ error }),
  )

/** Our own thread_control calls: the only events a caller repeats with a new time. */
const OWN_ACTION_EVENTS: ReadonlySet<ThreadControlEvent> = new Set(
  Object.values(ACTION_EVENTS),
)

/**
 * A retry (or a repeat) of our own take/release/pass carries a new
 * `occurredAt`, while the row already holds that exact transition: same event,
 * same resolved state, same owner role, and nothing landed in between (any
 * other applied event would have replaced `threadControlLastEvent`). Mapping
 * it onto the ORIGINAL transition time turns it into an exact redelivery:
 * the guarded write accepts it without advancing the clock, and the divider
 * is upserted under the original deterministic sourceId — restored exactly
 * once if an earlier attempt died before writing it, a no-op otherwise, and
 * never a second divider on a later repeat. Meta webhook events keep their own
 * timestamps, and an event carrying a context card is never remapped (its card
 * is keyed on its own time).
 */
const asOriginalOfRepeatedAction = (
  input: RecordThreadControlEventInput,
  nextState: ThreadControlState,
  ownerRole: ThreadControlRole | null,
): RecordThreadControlEventInput => {
  const { contactInbox, event } = input
  if (!OWN_ACTION_EVENTS.has(event) || input.context !== undefined) {
    return input
  }
  const originalAt =
    readThreadControlColumns(contactInbox).threadControlUpdatedAt
  const isSameTransition =
    contactInbox.threadControlLastEvent === event &&
    resolveStoredState(contactInbox, new Date()) === nextState &&
    (contactInbox.threadOwnerRole ?? null) === ownerRole &&
    (contactInbox.threadOwnerAppId ?? null) === (input.ownerAppId ?? null)
  if (!(isSameTransition && originalAt)) {
    return input
  }
  return { ...input, occurredAt: originalAt }
}

/** The row already held exactly this event at exactly this time. */
const isSameEvent = (
  contactInbox: ContactInboxModel,
  event: ThreadControlEvent,
  occurredAt: Date,
): boolean =>
  contactInbox.threadControlLastEvent === event &&
  readThreadControlColumns(contactInbox).threadControlUpdatedAt?.getTime() ===
    occurredAt.getTime()

/**
 * The expiry lifecycle, decided in one place: a caller-supplied value wins; an
 * owned/idle result has no expiry to honor and clears it. A `standby` result
 * keeps the stored expiry (`undefined`) ONLY for a continuation of the same
 * standby owner — a NEW standby session (the thread was not standby before, or a
 * different owner now holds it) must not inherit the previous session's expiry,
 * which may already be in the past and would make the new session resolve to
 * `idle` immediately (opening the send gate while the new owner holds control).
 * Such a session clears it (`null`) so the 24h idle fallback applies until the
 * channel reports a fresh expiry.
 */
const deriveThreadOwnerExpiresAt = (
  input: RecordThreadControlEventInput,
  nextState: ThreadControlState,
): Date | null | undefined => {
  if (input.threadOwnerExpiresAt !== undefined) {
    return input.threadOwnerExpiresAt
  }
  if (nextState !== "standby") {
    return null
  }
  const previous = input.contactInbox
  // Resolve the previous state AT this event's time (not the raw stored column):
  // a stored `standby` whose expiry has already passed resolves to `idle`, i.e.
  // a NEW session even when the same app re-appears — it must not inherit the
  // expired timestamp.
  const isSameStandbySession =
    resolveStoredState(previous, input.occurredAt) === "standby" &&
    (previous.threadOwnerAppId ?? null) === (input.ownerAppId ?? null)
  return isSameStandbySession ? undefined : null
}

const toSnapshot = (row: ContactInboxModel): ThreadControlSnapshot => ({
  contactInboxId: row.id,
  threadControlState: row.threadControlState,
  threadOwnerRole: row.threadOwnerRole,
  threadOwnerAppId: row.threadOwnerAppId ?? null,
  threadControlUpdatedAt: row.threadControlUpdatedAt,
  threadOwnerExpiresAt: row.threadOwnerExpiresAt ?? null,
  threadControlLastEvent: row.threadControlLastEvent,
})

class ThreadControlService extends BaseService {
  /**
   * Applies one routing event with a guarded write and, when the visible
   * state changed, records the divider, busts the contact-inbox cache and
   * publishes realtime. A context (summary/history) additionally writes one
   * idempotent card whenever the event was applied.
   */
  async recordEvent(
    requested: RecordThreadControlEventInput,
  ): Promise<RecordThreadControlEventResult> {
    const ownerRole = parseThreadControlRole(requested.ownerRole)
    const nextState = THREAD_CONTROL_TRANSITIONS[requested.event]
    const { input, row, isRemapStale } = await this.applyTransition(
      requested,
      nextState,
      ownerRole,
    )
    const { contactInbox, event, occurredAt, context } = input

    if (isRoutingTraffic(event, context !== undefined)) {
      await this.touchInboxSeen(input)
    }

    if (!row) {
      return {
        eventApplied: false,
        stateChanged: false,
        isRedelivery: false,
        row: null,
      }
    }

    const previousState = resolveStoredState(contactInbox, new Date())
    // A remapped repeat that turned out stale means a newer event landed
    // after our row was read (e.g. Meta's control_taken during our call), so
    // the in-memory row is out of date: our applied action did change the
    // stored state, and it gets its own divider.
    const stateChanged =
      isRemapStale ||
      previousState !== nextState ||
      (contactInbox.threadOwnerRole ?? null) !== ownerRole ||
      (contactInbox.threadOwnerAppId ?? null) !== (input.ownerAppId ?? null)
    const isRedelivery = isSameEvent(contactInbox, event, occurredAt)

    // The divider is written for a state change, and rewritten (deduplicated
    // by its deterministic sourceId) on an exact redelivery, in case an
    // earlier attempt died before writing it. The cache bust and the realtime
    // snapshot run for EVERY applied event, even when the divider write
    // throws: the stored state already changed, and a retry may never reach
    // this point again (e.g. archive release retried into a permanent Meta
    // "not the owner"). They are idempotent, and hot paths never get here for
    // a no-op (inbound deliveries on an already owned/standby thread and sends
    // on an owned thread return before `recordEvent`). The divider's error is
    // still rethrown so the job retries.
    const dividerFailure = await settle(
      stateChanged || isRedelivery
        ? this.writeMessage(input, "activity", ownerRole, isRedelivery)
        : Promise.resolve(false),
    )
    await this.announceAfterDivider(input, row, dividerFailure)

    // Write the context card when either a conversation_context or a handover
    // note is present. Meta omits the context on a handover to a partner that
    // had standby access, but may still send `metadata` (the note) — without
    // this the note would be invisible.
    if (context || input.handoverNote) {
      await this.writeMessage(input, "context", ownerRole, isRedelivery)
    }

    return { eventApplied: true, stateChanged, isRedelivery, row }
  }

  /**
   * The guarded write. A repeated own action is first tried at its original
   * transition time (`asOriginalOfRepeatedAction`); if that is stale — a newer
   * event landed while our channel call ran, and Meta accepted our action
   * after it — it is applied once more at the requested time instead.
   */
  private async applyTransition(
    requested: RecordThreadControlEventInput,
    nextState: ThreadControlState,
    ownerRole: ThreadControlRole | null,
  ): Promise<{
    input: RecordThreadControlEventInput
    row: ContactInboxModel | null
    isRemapStale: boolean
  }> {
    const threadOwnerExpiresAt = deriveThreadOwnerExpiresAt(
      requested,
      nextState,
    )
    const normalWrite = (input: RecordThreadControlEventInput) =>
      contactInboxRepository.applyThreadControlTransition({
        id: input.contactInbox.id,
        workspaceId: input.workspaceId,
        event: input.event,
        ownerRole,
        ownerAppId: input.ownerAppId ?? null,
        previousOwnerAppId: input.previousOwnerAppId ?? null,
        threadOwnerExpiresAt,
        occurredAt: input.occurredAt,
      })
    const write = async (input: RecordThreadControlEventInput) => {
      if (!input.supersedesStandbyAt) {
        return await normalWrite(input)
      }
      // Promotion of a standby copy: applies only while the row is still that
      // exact copy. Otherwise (already promoted = exact redelivery, or a
      // handover / later event got there first) the normal guard decides:
      // a redelivery is idempotent and a handover outranks `inboundReceived`.
      const promoted =
        await contactInboxRepository.promoteStandbyToOwnerDelivery({
          id: input.contactInbox.id,
          workspaceId: input.workspaceId,
          ownerRole,
          previousOwnerAppId: input.previousOwnerAppId ?? null,
          threadOwnerExpiresAt,
          occurredAt: input.supersedesStandbyAt,
        })
      return promoted ?? (await normalWrite(input))
    }

    const remapped = asOriginalOfRepeatedAction(requested, nextState, ownerRole)
    const row = await write(remapped)
    if (row || remapped === requested) {
      return { input: remapped, row, isRemapStale: false }
    }
    const fallbackRow = await write(requested)
    return {
      input: requested,
      row: fallbackRow,
      isRemapStale: fallbackRow !== null,
    }
  }

  /**
   * Announces the applied state, then rethrows the divider's failure (if
   * any). An announcement failure after a divider failure is logged so the
   * divider's error, which the retry must see, is the one rethrown.
   */
  private async announceAfterDivider(
    input: RecordThreadControlEventInput,
    row: ContactInboxModel,
    dividerFailure: SettledFailure | null,
  ): Promise<void> {
    try {
      await this.announceStateChange(input, row)
    } catch (err) {
      if (!dividerFailure) {
        throw err
      }
      logger.warn(
        { err, contactInboxId: row.id },
        "Thread control: announcement failed after a divider failure",
      )
    }
    if (dividerFailure) {
      throw dividerFailure.error
    }
  }

  /**
   * Promotes a message stored from a standby delivery once its owner delivery
   * (the same message, delivered to us as owner) arrives. A row without the
   * standby marker costs no query. The claim is one guarded `jsonb ||` UPDATE
   * that only succeeds while the promoted key is absent, so of any number of
   * concurrent owner redeliveries exactly one gets `true`, and a promoted row
   * is never promoted again.
   */
  async promoteStandbyDelivery(input: {
    workspaceId: string
    message: Pick<MessageModel, "id" | "createdAt" | "contentAttributes">
  }): Promise<boolean> {
    const { workspaceId, message } = input
    if (!isUnpromotedStandbyCopy(message)) {
      return false
    }
    const repository = await createMessageRepository()
    const claimed = await repository.claimContentAttributes({
      messageId: message.id,
      workspaceId,
      createdAt: new Date(message.createdAt),
      guardKey: THREAD_CONTROL_PROMOTED_KEY,
      overlay: { [THREAD_CONTROL_PROMOTED_KEY]: true },
    })
    return claimed !== null
  }

  /**
   * The inbound hook, decided in one place. `owner` deliveries mean we own the
   * thread (Meta: the receiver becomes owner), `standby` deliveries mean we
   * only listen. Returns `null` when nothing is written:
   *
   * - a single-partner number never receives routing traffic, so its `null`
   *   threads are left alone (zero queries, UI unchanged);
   * - an owned thread stays owned, a standby thread stays standby, unless the
   *   delivery carries a context card to record.
   */
  recordInboundDelivery(
    input: RecordInboundDeliveryInput,
  ): Promise<RecordThreadControlEventResult | null> {
    const { delivery, context, contactInbox, inbox } = input
    const now = input.now ?? new Date()
    const resolved = resolveStoredState(contactInbox, now)

    const decision = INBOUND_DELIVERY_DECISIONS[delivery]
    const isRecorded =
      decision.shouldRecord({
        resolved,
        isInboxActive: isInboxThreadControlActive(
          inbox.threadControlSeenAt,
          now,
        ),
        ownerAppId: input.ownerAppId ?? null,
        storedOwnerAppId: contactInbox.threadOwnerAppId ?? null,
      }) || context !== undefined
    if (!isRecorded) {
      return Promise.resolve(null)
    }

    const { ownerAppId, ownerRole, ...rest } = input
    return this.recordEvent({
      ...rest,
      event: decision.event,
      // Only a standby delivery names another app as owner; an owner
      // delivery leaves it null (owned -> "you" needs no app id).
      ownerAppId: delivery === "standby" ? (ownerAppId ?? null) : null,
      ownerRole: delivery === "standby" ? (ownerRole ?? null) : null,
    })
  }

  /**
   * Reconciles the stored owner with the channel's own answer. The channel is
   * the authority, so a difference is recorded as an OBSERVATION through the
   * existing `recordEvent` (`inboundReceived` = we own it, `standbyReceived` =
   * another app owns it, `released` = nobody), stamped when the owner query started. `recordEvent`
   * only writes a divider + realtime when the resolved state or owner
   * changed, and this method skips the write entirely when the stored row
   * already matches — so a sync that CONFIRMS the current state changes
   * nothing, and one that CORRECTS it writes exactly one divider.
   *
   * A channel that cannot answer (`fetchOwner` -> `null`), or an app id that
   * cannot be classified without our own id, leaves the row untouched.
   */
  async syncThreadOwner(
    input: SyncThreadOwnerInput,
  ): Promise<ThreadControlSnapshot> {
    const { workspaceId, contactInbox, conversationId } = input
    // Stamped when the query STARTS (as in `requestAction`): an event that
    // lands while the answer is in flight is newer than the answer and must
    // win the guarded write, never be overwritten by the stale observation.
    const occurredAt = toThreadControlTimestamp(new Date())
    const owner = await input.fetchOwner(contactInbox)
    if (!owner) {
      return toSnapshot(contactInbox)
    }

    const kind = classifyThreadOwner(owner.ownerAppId, {
      ownAppId: input.ownAppId ?? owner.ownAppId ?? null,
      businessAiAppId: input.businessAiAppId ?? owner.businessAiAppId ?? null,
    })
    if (kind === "unknown") {
      return toSnapshot(contactInbox)
    }

    const resolved = resolveStoredState(contactInbox, occurredAt)
    const storedOwnerAppId = contactInbox.threadOwnerAppId ?? null
    const plan = OWNER_SYNC_PLANS[kind]
    const ownerAppId = plan.keepsOwnerAppId ? owner.ownerAppId : null
    const isConfirmed = plan.isConfirmed({
      resolved,
      storedOwnerAppId,
      ownerAppId,
    })
    if (isConfirmed) {
      // Owner already matches: nothing to record, but a standby thread may
      // still need Meta's expiry stored (no divider, no ownership change).
      return await this.refineStandbyExpiry({
        workspaceId,
        contactInbox,
        conversationId,
        expiresAt: isStandbyPlan(plan) ? owner.expiresAt : undefined,
        ownerAppId,
      })
    }

    const { row } = await this.recordEvent({
      workspaceId,
      inbox: { id: contactInbox.inboxId, threadControlSeenAt: null },
      contactInbox,
      conversationId,
      event: plan.event,
      ownerRole: plan.ownerRole,
      ownerAppId,
      previousOwnerAppId: storedOwnerAppId,
      threadOwnerExpiresAt: isStandbyPlan(plan) ? owner.expiresAt : undefined,
      occurredAt,
    })
    return toSnapshot(row ?? contactInbox)
  }

  /**
   * Stores the channel's expiry on an already-matching standby thread without
   * recording an event (so no divider and no ownership rewrite). Skipped when
   * the value is unchanged or the row moved on meanwhile (the guarded write
   * only matches the same standby owner AND the ownership version the answer
   * was fetched against, so an A -> us -> A change cannot take a stale expiry).
   */
  private async refineStandbyExpiry(input: {
    workspaceId: string
    contactInbox: ContactInboxModel
    conversationId: string
    expiresAt: Date | null | undefined
    ownerAppId: string | null
  }): Promise<ThreadControlSnapshot> {
    const { workspaceId, contactInbox, conversationId, expiresAt } = input
    const stored = readThreadControlColumns(contactInbox).threadOwnerExpiresAt
    const isUnchanged =
      expiresAt === undefined ||
      (expiresAt?.getTime() ?? null) === (stored?.getTime() ?? null)
    if (isUnchanged) {
      return toSnapshot(contactInbox)
    }
    const row = await contactInboxRepository.setStandbyThreadOwnerExpiresAt({
      id: contactInbox.id,
      workspaceId,
      ownerAppId: input.ownerAppId,
      observedUpdatedAt: contactInbox.threadControlUpdatedAt ?? null,
      threadOwnerExpiresAt: expiresAt,
    })
    if (!row) {
      return toSnapshot(contactInbox)
    }
    await this.announceStateChange(
      { workspaceId, conversationId, contactInbox },
      row,
    )
    return toSnapshot(row)
  }

  /**
   * The routing columns as they are NOW, for a caller holding a row that went
   * through a queue (a send job carries the contact inbox as it was at
   * enqueue). Uncached and workspace-scoped; returns the given row when it
   * never observed routing (`null` state), so single-partner and non-WhatsApp
   * sends cost no query. A thread that is `null` at enqueue and gets its
   * first routing event before the send is not re-read: that window is the
   * enqueue→send latency of the very first routing event, and Meta remains
   * the authority for it.
   */
  async refreshForRouting(input: {
    workspaceId: string
    contactInbox: ContactInboxModel
  }): Promise<ContactInboxModel> {
    const { workspaceId, contactInbox } = input
    if ((contactInbox.threadControlState ?? null) === null) {
      return contactInbox
    }
    const current = await contactInboxRepository.findModelByIdForWorkspace({
      id: contactInbox.id,
      workspaceId,
    })
    return current ?? contactInbox
  }

  /**
   * Take/release/pass on the channel, then record the outcome. The channel
   * call goes first: a `ChannelError` propagates unchanged and leaves the
   * state untouched. A stale event (a newer transition already landed) returns
   * the current row instead.
   */
  async requestAction(
    input: RequestThreadControlActionInput,
  ): Promise<ThreadControlSnapshot> {
    const { workspaceId, contactInboxId, conversationId, action } = input
    const contactInbox = await contactInboxRepository.findModelByIdForWorkspace(
      { id: contactInboxId, workspaceId },
    )
    if (!contactInbox) {
      throw notFoundException("Contact inbox not found")
    }
    if (
      input.expectedThreadControlUpdatedAt !== undefined &&
      (contactInbox.threadControlUpdatedAt?.getTime() ?? null) !==
        (input.expectedThreadControlUpdatedAt?.getTime() ?? null)
    ) {
      return toSnapshot(contactInbox)
    }

    // Stamped when the request STARTS, not when Meta answers: an event that
    // lands while our call is in flight (e.g. another partner's
    // control_taken) is later than our action and must win the guarded
    // write — also in the same second, where Meta's events outrank ours by
    // precedence. An event from before the call started still loses.
    const occurredAt = toThreadControlTimestamp(new Date())
    const { ownerRole, ownerAppId } = await input.applyOnChannel(contactInbox)

    const { row } = await this.recordEvent({
      workspaceId,
      inbox: { id: contactInbox.inboxId, threadControlSeenAt: null },
      contactInbox,
      conversationId,
      event: ACTION_EVENTS[action],
      ownerRole,
      ownerAppId: ownerAppId ?? null,
      // A take/pass overwrites the owner: keep who held the thread before, so
      // an app-id channel still knows its return target.
      previousOwnerAppId: contactInbox.threadOwnerAppId ?? null,
      occurredAt,
    })
    if (row) {
      return toSnapshot(row)
    }

    // Stale: a newer transition already landed, so report that one.
    const current = await contactInboxRepository.findModelByIdForWorkspace({
      id: contactInboxId,
      workspaceId,
    })
    return toSnapshot(current ?? contactInbox)
  }

  /**
   * The thread's resolved state and ownership version
   * (`threadControlUpdatedAt`, advanced by every applied transition) as they
   * are NOW (uncached, workspace-scoped), for a queued job that must confirm
   * the thread is still in the state it was enqueued for. `null` when the row
   * is gone or has never observed routing.
   */
  async resolveCurrentState(input: {
    workspaceId: string
    contactInboxId: string
  }): Promise<{
    state: ThreadControlState
    threadControlUpdatedAt: Date | null
  } | null> {
    const current = await contactInboxRepository.findModelByIdForWorkspace({
      id: input.contactInboxId,
      workspaceId: input.workspaceId,
    })
    const state = current ? resolveStoredState(current, new Date()) : null
    return current && state
      ? { state, threadControlUpdatedAt: current.threadControlUpdatedAt }
      : null
  }

  /**
   * Archive auto-release: one query for the contacts' owned threads, filtered
   * to those still owned (an owned row older than 24h of silence is idle and
   * Meta needs no call) on a channel whose archive releases (a channel without
   * that capability is skipped, no idle state recorded), then one deduplicated
   * job per thread. No channel call happens here, so archiving never waits on
   * Meta.
   */
  async releaseOwnedThreadsForContacts(input: {
    workspaceId: string
    conversations: { id: string; contactId: string }[]
    archivedAt: Date
  }): Promise<void> {
    const { workspaceId, conversations, archivedAt } = input
    const conversationIdByContactId = new Map<string, string>()
    for (const conversation of conversations) {
      if (!conversationIdByContactId.has(conversation.contactId)) {
        conversationIdByContactId.set(conversation.contactId, conversation.id)
      }
    }
    if (conversationIdByContactId.size === 0) {
      return
    }

    const rows = await contactInboxRepository.listThreadControlledByContactIds({
      workspaceId,
      contactIds: [...conversationIdByContactId.keys()],
    })
    const now = new Date()
    for (const row of rows) {
      const conversationId = conversationIdByContactId.get(row.contactId)
      const state = resolveThreadControlState({
        state: row.threadControlState,
        lastIncomingMessageAt: row.lastIncomingMessageAt,
        threadControlUpdatedAt: row.threadControlUpdatedAt,
        threadOwnerExpiresAt: row.threadOwnerExpiresAt,
        now,
      })
      if (
        state !== "owned" ||
        !conversationId ||
        !supportsArchiveRelease(row.channel)
      ) {
        continue
      }
      await enqueueIntegrationJob(
        {
          type: IntegrationJobAction.threadControlAction,
          data: {
            workspaceId,
            contactInboxId: row.id,
            conversationId,
            action: "release",
            // The ownership version this release was decided for: the job
            // skips when any transition happened since (reacquired thread).
            threadControlUpdatedAt:
              row.threadControlUpdatedAt?.toISOString() ?? null,
          },
        },
        {
          // Keyed on BOTH the ownership version AND this archive event: a
          // delayed release that no-ops (the thread was unarchived) completes
          // and is retained, so a later re-archive must enqueue a DISTINCT job
          // rather than be deduplicated against it. The version still collapses
          // duplicate enqueues of the same archive.
          jobId: `thread-release-${row.id}-${row.threadControlUpdatedAt?.getTime() ?? 0}-${archivedAt.getTime()}`,
          removeOnFail: true,
        },
      )
    }
  }

  /** Marks the inbox multi-responder; SQL-throttled, skipped while still fresh. */
  private async touchInboxSeen(
    input: RecordThreadControlEventInput,
  ): Promise<void> {
    const { inbox, workspaceId } = input
    const now = new Date()
    const seenAt = inbox.threadControlSeenAt
    const isFresh =
      seenAt !== null &&
      now.getTime() - seenAt.getTime() < THREAD_CONTROL_SEEN_REFRESH_MS
    if (isFresh) {
      return
    }
    await inboxRepository.touchThreadControlSeen({
      workspaceId,
      inboxId: inbox.id,
      seenAt: now,
    })
  }

  /** Busts the contact-inbox cache and tells open clients the new owner. */
  private async announceStateChange(
    input: Pick<
      RecordThreadControlEventInput,
      "workspaceId" | "conversationId" | "contactInbox"
    >,
    row: ContactInboxModel,
  ): Promise<void> {
    await this.invalidateCacheTags([
      `contacts:${input.contactInbox.contactId}:contact-inboxes`,
    ])
    publishToWorkspaceParty(input.workspaceId, {
      eventType: RealtimeEventType.contactInboxThreadControlUpdated,
      data: {
        conversationId: input.conversationId,
        contactInboxId: row.id,
        threadControlState: row.threadControlState,
        threadOwnerRole: row.threadOwnerRole,
        threadOwnerAppId: row.threadOwnerAppId ?? null,
        threadControlUpdatedAt:
          row.threadControlUpdatedAt?.toISOString() ?? null,
        threadOwnerExpiresAt: row.threadOwnerExpiresAt?.toISOString() ?? null,
        threadControlLastEvent: row.threadControlLastEvent,
      },
    })
  }

  /**
   * Moves `ContactInbox.lastMessageAt` forward to the routing row just
   * written. The conversation's message list pages from
   * `endOfHour(lastMessageAt)`, so without this a divider or context card
   * stamped after that hour stays invisible until the next real message
   * (same reason `whatsapp-call-finalize` bumps it for call cards).
   *
   * Uses `bulkUpdateTracking` because it is the tracking write that is
   * atomic in SQL (`GREATEST`): concurrent routing events can never move the
   * column backwards. `firstInteractionAt` is passed through unchanged
   * (`LEAST(existing, existing)`), falling back to the event time only on a
   * row that never had one.
   */
  private async bumpLastMessageAt(
    input: RecordThreadControlEventInput,
  ): Promise<void> {
    const { contactInbox, occurredAt, workspaceId } = input
    const lastMessageAt = contactInbox.lastMessageAt
      ? new Date(contactInbox.lastMessageAt)
      : null
    if (lastMessageAt && lastMessageAt >= occurredAt) {
      return
    }
    try {
      await contactInboxService.bulkUpdateTracking({
        rows: [
          {
            contactInboxId: contactInbox.id,
            contactId: contactInbox.contactId,
            workspaceId,
            firstInteractionAt: contactInbox.firstInteractionAt
              ? new Date(contactInbox.firstInteractionAt)
              : occurredAt,
            lastMessageAt: occurredAt,
            lastIncomingMessageAt: null,
          },
        ],
      })
    } catch (err) {
      // The routing row is stored; a failed bump only delays its visibility
      // until the next message, so it must not fail the event.
      logger.warn(
        { err, contactInboxId: contactInbox.id },
        "Thread control: unable to bump the contact inbox lastMessageAt",
      )
    }
  }

  /** Writes one routing message; `true` when it was new (not a redelivery). */
  private async writeMessage(
    input: RecordThreadControlEventInput,
    kind: RoutingMessageKind,
    ownerRole: ThreadControlRole | null,
    isRedelivery: boolean,
  ): Promise<boolean> {
    const { contactInbox, event, occurredAt, workspaceId } = input
    const message = ROUTING_MESSAGES[kind](input, ownerRole, isRedelivery)
    const repository = await createMessageRepository()
    const { message: written, isNew } = await repository.createOrUpdate({
      id: createId(),
      conversationId: input.conversationId,
      contactInboxId: contactInbox.id,
      workspaceId,
      sourceId: `${message.sourceIdPrefix}:${contactInbox.id}:${event}:${occurredAt.getTime()}`,
      senderType: "system",
      senderId: null,
      messageType: "activity",
      text: message.text,
      contentType: "text",
      contentAttributes: message.contentAttributes,
      createdAt: occurredAt,
    })

    if (!isNew) {
      return false
    }
    await this.bumpLastMessageAt(input)
    try {
      publishToWorkspaceParty(workspaceId, {
        eventType: RealtimeEventType.messageCreated,
        data: { ...(written as MessageModel), attachments: [] },
      })
    } catch (err) {
      logger.warn(
        { err, contactInboxId: contactInbox.id },
        "Thread control: unable to publish the routing message",
      )
    }
    return true
  }
}

type OwnerSyncPlan = {
  event: ThreadControlEvent
  /** Owner role recorded with the observation (`null` = not a role). */
  ownerRole: ThreadControlRole | null
  /** Whether the channel's owner app id is stored (we own it: no app id). */
  keepsOwnerAppId: boolean
  isConfirmed: (state: {
    resolved: ThreadControlState | null
    storedOwnerAppId: string | null
    ownerAppId: string | null
  }) => boolean
}

/** A plan whose observation leaves the thread with another owner (standby). */
const isStandbyPlan = (plan: OwnerSyncPlan): boolean =>
  THREAD_CONTROL_TRANSITIONS[plan.event] === "standby"

/** Observation event per classified owner; see `syncThreadOwner`. */
const OWNER_SYNC_PLANS: Record<ThreadOwnerKind, OwnerSyncPlan> = {
  self: {
    event: "inboundReceived",
    ownerRole: null,
    keepsOwnerAppId: false,
    isConfirmed: ({ resolved }) => resolved === "owned",
  },
  businessAi: {
    event: "standbyReceived",
    ownerRole: threadControlRoles.enum.ai_agent,
    keepsOwnerAppId: true,
    isConfirmed: ({ resolved, storedOwnerAppId, ownerAppId }) =>
      resolved === "standby" && storedOwnerAppId === ownerAppId,
  },
  partner: {
    event: "standbyReceived",
    ownerRole: null,
    keepsOwnerAppId: true,
    isConfirmed: ({ resolved, storedOwnerAppId, ownerAppId }) =>
      resolved === "standby" && storedOwnerAppId === ownerAppId,
  },
  none: {
    event: "released",
    ownerRole: null,
    keepsOwnerAppId: false,
    // A never-observed thread with no owner has nothing to correct.
    isConfirmed: ({ resolved }) => resolved === "idle" || resolved === null,
  },
}

type InboundDecision = {
  event: ThreadControlEvent
  shouldRecord: (state: {
    resolved: ThreadControlState | null
    isInboxActive: boolean
    /** Owner app id the delivery names, and the one already stored. */
    ownerAppId: string | null
    storedOwnerAppId: string | null
  }) => boolean
}

/** Strategy map per delivery role; see `recordInboundDelivery`. */
const INBOUND_DELIVERY_DECISIONS: Record<
  ThreadControlDelivery,
  InboundDecision
> = {
  owner: {
    event: "inboundReceived",
    // A `null` thread on a number with no routing traffic stays `null`.
    shouldRecord: ({ resolved, isInboxActive }) =>
      resolved !== "owned" && (resolved !== null || isInboxActive),
  },
  standby: {
    event: "standbyReceived",
    // Also when the thread is already standby but the delivery names an
    // owner app we do not have yet (or a different one).
    shouldRecord: ({ resolved, ownerAppId, storedOwnerAppId }) =>
      resolved !== "standby" ||
      (ownerAppId !== null && ownerAppId !== storedOwnerAppId),
  },
}

type RoutingMessagePayload = {
  sourceIdPrefix: string
  text?: string
  contentAttributes: Record<string, unknown>
}

const ROUTING_MESSAGES: Record<
  RoutingMessageKind,
  (
    input: RecordThreadControlEventInput,
    ownerRole: ThreadControlRole | null,
    isRedelivery: boolean,
  ) => RoutingMessagePayload
> = {
  activity: (input, ownerRole, isRedelivery) => {
    // The owner being replaced by this event, kept per-event on the divider for
    // audit (the row column is overwritten each event). Prefer the payload's
    // explicit value; fall back to the owner stored on the row. On a REDELIVERY
    // the row has already moved to the new owner, so that fallback would
    // mislabel the new owner as previous — omit it then rather than record a
    // wrong one.
    const storedPreviousOwnerRole = isRedelivery
      ? null
      : parseThreadControlRole(input.contactInbox.threadOwnerRole)
    const previousOwnerRole =
      parseThreadControlRole(input.previousOwnerRole) ?? storedPreviousOwnerRole
    const previousOwnerAppId =
      input.previousOwnerAppId ??
      (isRedelivery ? null : input.contactInbox.threadOwnerAppId)
    return {
      sourceIdPrefix: THREAD_CONTROL_SOURCE_ID_PREFIX,
      text: resolveThreadControlActivityText(
        input.event,
        input.contactInbox.channel,
      ),
      contentAttributes: {
        type: THREAD_CONTROL_ACTIVITY_TYPE,
        event: input.event,
        ownerRole,
        ...(previousOwnerRole ? { previousOwnerRole } : {}),
        ...(previousOwnerAppId ? { previousOwnerAppId } : {}),
      },
    }
  },
  context: (input) => ({
    sourceIdPrefix: THREAD_CONTROL_CONTEXT_SOURCE_ID_PREFIX,
    contentAttributes: {
      type: THREAD_CONTROL_CONTEXT_TYPE,
      // A note-only handover (standby-access owner) carries no context.
      ...(input.context ? { context: input.context } : {}),
      ...(input.handoverNote ? { handoverNote: input.handoverNote } : {}),
    },
  }),
}

export const threadControlService = new ThreadControlService()
