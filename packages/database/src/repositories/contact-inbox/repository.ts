import type {
  AdReferralChannelType,
  adsEligibleChannelTypes,
} from "@chatbotx.io/utils/channel"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  exists,
  getTableColumns,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "../../client"
import {
  eventsOutrankedBy,
  THREAD_CONTROL_TRANSITIONS,
  type ThreadControlEvent,
  type ThreadControlRole,
} from "../../partials/thread-control"
import { adConversationPredicate } from "../../queries/ad-referral"
import {
  type BulkEligibilityInput,
  bulkEligibilityConditions,
  bulkEligibilityWhere,
} from "../../queries/ai-handover-bulk-eligibility"
import type { AdsConversionChannel } from "../../schema"
import {
  type ContactInboxIdentityChangeReason,
  type ContactInboxIdentityHistoryEntry,
  contactInboxModel,
  conversationModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
} from "../../types"

/**
 * A contact-inbox a bulk AI hand-over run acts on, with its direct-message
 * conversation. The full row, because settling a thread
 * (`threadControlService.recordEvent`) needs it and a per-contact re-read
 * would be an N+1.
 */
export type BulkAiContactInboxRow = ContactInboxModel & {
  conversationId: string
}

export type WhatsappCtwaInboxRow = {
  contactInboxId: string
  integrationWhatsappId: string
}

export type WhatsappCtwaInboxByContactRow = WhatsappCtwaInboxRow & {
  contactId: string
}

export type AdEligibleInboxChannel = Extract<
  AdsConversionChannel,
  (typeof adsEligibleChannelTypes.options)[number]
>

export type AdEligibleInboxByContactRow = {
  contactId: string
  contactInboxId: string
  channel: AdEligibleInboxChannel
  integrationId: string
}

/**
 * Messenger/Instagram ad-referral attribution, from the shared leaf module.
 *
 * NOT used for the WhatsApp entry below: this map feeds CAPI eligibility, not
 * reporting, and the CAPI send needs a real `ctwaClid` (see
 * `evaluateWhatsappTemplateSent`). Widening WhatsApp here would only push rows
 * into the evaluator for it to drop again — wasted work per request.
 */
const adReferralConditions = (channel: AdReferralChannelType): SQL[] => [
  adConversationPredicate(channel),
]

type AdEligibleIntegrationModel =
  | typeof integrationWhatsappModel
  | typeof integrationMessengerModel
  | typeof integrationInstagramModel

type AdEligibleInboxChannelConfig = {
  model: () => AdEligibleIntegrationModel
  channel: AdEligibleInboxChannel
  referralConditions: () => SQL[]
}

/**
 * Per-channel query config for `listAdEligibleInboxesByContacts` — mirrors
 * the `integrationInboxModelFactoryByChannel` factory-map pattern in
 * `ctwa-retarget.ts`: a LAZY `model` factory (not a precomputed table
 * reference) so a mocked `@chatbotx.io/database/schema` missing one of the
 * three tables in tests doesn't fail to import this module.
 */
const ctwaReferralCondition = (): SQL =>
  sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`

/** Most recent first; rows that never had a message sort last. */
const mostRecentMessageFirst = (): SQL =>
  sql`${contactInboxModel.lastMessageAt} DESC NULLS LAST`

const adEligibleInboxChannelConfigs = {
  whatsapp: {
    model: () => integrationWhatsappModel,
    channel: "whatsapp",
    referralConditions: () => [ctwaReferralCondition()],
  },
  messenger: {
    model: () => integrationMessengerModel,
    channel: "messenger",
    referralConditions: () => adReferralConditions("messenger"),
  },
  instagram: {
    model: () => integrationInstagramModel,
    channel: "instagram",
    referralConditions: () => adReferralConditions("instagram"),
  },
} satisfies Record<AdEligibleInboxChannel, AdEligibleInboxChannelConfig>

export type ContactInboxWorkspaceRow = Pick<
  ContactInboxModel,
  "id" | "channel" | "inboxId" | "sourceId"
>

export type ContactInboxIdentityFields = Pick<
  ContactInboxModel,
  "sourceId" | "sourceUserId" | "sourceParentUserId"
>

type RequireAtLeastOne<T> = {
  [Key in keyof T]-?: Required<Pick<T, Key>> & Partial<Omit<T, Key>>
}[keyof T]

export type ContactInboxIdentityGuard =
  RequireAtLeastOne<ContactInboxIdentityFields>

export const CONTACT_INBOX_IDENTITY_HISTORY_LIMIT = 10

// Ordinary message/cache reads do not need the audit trail. Callers keep their
// established model signatures until queue and channel DTOs can be narrowed.
export const contactInboxOperationalColumns = {
  sourceIdentityHistory: false,
} as const

const contactInboxIdentityColumns = {
  sourceId: contactInboxModel.sourceId,
  sourceParentUserId: contactInboxModel.sourceParentUserId,
  sourceUserId: contactInboxModel.sourceUserId,
} satisfies Record<keyof ContactInboxIdentityFields, unknown>

type ContactInboxIdentitySet = Partial<ContactInboxIdentityFields>

const appendIdentityHistoryExpression = (input: {
  changedAt: string
  reason: ContactInboxIdentityChangeReason
}) => sql<ContactInboxIdentityHistoryEntry[]>`(
  SELECT COALESCE(jsonb_agg("entry" ORDER BY "ordinality"), '[]'::jsonb)
  FROM (
    SELECT "entry", "ordinality"
    FROM jsonb_array_elements(
      COALESCE(${contactInboxModel.sourceIdentityHistory}, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'sourceId', ${contactInboxModel.sourceId},
          'sourceUserId', ${contactInboxModel.sourceUserId},
          'sourceParentUserId', ${contactInboxModel.sourceParentUserId},
          'changedAt', ${input.changedAt}::text,
          'reason', ${input.reason}::text
        )
      )
    ) WITH ORDINALITY AS "history"("entry", "ordinality")
    ORDER BY "ordinality" DESC
    LIMIT ${CONTACT_INBOX_IDENTITY_HISTORY_LIMIT}::int
  ) AS "newestHistory"
)`

/**
 * The projection producing a {@link ContactInboxWorkspaceRow}. Shared by the
 * four queries that return one, so the row type and the columns actually
 * selected cannot drift apart — adding a column to the type above is a compile
 * error until it is added here too.
 */
const contactInboxWorkspaceRowColumns = {
  id: contactInboxModel.id,
  channel: contactInboxModel.channel,
  inboxId: contactInboxModel.inboxId,
  sourceId: contactInboxModel.sourceId,
} satisfies Record<keyof ContactInboxWorkspaceRow, unknown>

/**
 * The columns a coexist history patch needs to decide (a) which ContactInbox a
 * `wa_id` belongs to and (b) how far back it may safely read messages.
 */
export type ContactInboxBySourceIdRow = Pick<
  ContactInboxModel,
  "id" | "sourceId" | "lastIncomingMessageAt" | "createdAt"
>

export type ApplyThreadControlTransitionInput = {
  id: string
  workspaceId: string
  event: ThreadControlEvent
  /** Role of the owner AFTER the event; null when there is none / it is unknown. */
  ownerRole: ThreadControlRole | null
  /**
   * App id of the owner AFTER the event, for channels that name owners by app
   * id (null for role-based channels). Part of the same-second idempotency
   * check, so two passes to different apps are never one redelivery.
   */
  ownerAppId?: string | null
  /** App id of the owner BEFORE the event (the return target); null when unknown. */
  previousOwnerAppId?: string | null
  /**
   * Channel-reported expiry of the non-owned thread. `undefined` keeps the
   * stored value, `null` clears it, a Date sets it. A refinement of the state,
   * not part of ownership identity, so it is never in the transition guard.
   */
  threadOwnerExpiresAt?: Date | null | undefined
  /** Meta event time for webhook events, `now` for our own calls. */
  occurredAt: Date
}

/** A ContactInbox we own, as `releaseOwnedThreadsForContacts` needs it. */
export type ThreadControlledContactInboxRow = Pick<
  ContactInboxModel,
  | "id"
  | "contactId"
  | "inboxId"
  | "channel"
  | "threadControlState"
  | "threadControlUpdatedAt"
  | "threadOwnerExpiresAt"
  | "lastIncomingMessageAt"
>

/**
 * Guard for `applyThreadControlTransition`. Meta timestamps have second
 * resolution, so on an equal timestamp the event with higher precedence wins,
 * an exact redelivery (same event, state and role) is accepted as idempotent,
 * and anything else is stale. This is a total order, so the final state does
 * not depend on the order events are processed in.
 */
const threadControlTransitionGuard = (
  input: ApplyThreadControlTransitionInput,
  state: (typeof THREAD_CONTROL_TRANSITIONS)[ThreadControlEvent],
): SQL | undefined => {
  const outranked = eventsOutrankedBy(input.event)
  return or(
    isNull(contactInboxModel.threadControlUpdatedAt),
    lt(contactInboxModel.threadControlUpdatedAt, input.occurredAt),
    and(
      eq(contactInboxModel.threadControlUpdatedAt, input.occurredAt),
      or(
        outranked.length > 0
          ? inArray(contactInboxModel.threadControlLastEvent, outranked)
          : undefined,
        and(
          eq(contactInboxModel.threadControlLastEvent, input.event),
          eq(contactInboxModel.threadControlState, state),
          sql`${contactInboxModel.threadOwnerRole} IS NOT DISTINCT FROM ${input.ownerRole}`,
          sql`${contactInboxModel.threadOwnerAppId} IS NOT DISTINCT FROM ${input.ownerAppId ?? null}`,
        ),
      ),
    ),
  )
}

/** The contact's direct-message conversation (`sourceId IS NULL`), same workspace. */
const bulkConversationJoin = (workspaceId: string) =>
  and(
    eq(conversationModel.contactId, contactInboxModel.contactId),
    isNull(conversationModel.sourceId),
    eq(conversationModel.workspaceId, workspaceId),
  )

export const contactInboxRepository = {
  async updateIdentityGuarded(
    input: {
      id: string
      guard: ContactInboxIdentityGuard
      set: ContactInboxIdentitySet
      appendIdentityHistory?: {
        changedAt: string
        reason: ContactInboxIdentityChangeReason
      }
    },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel | undefined> {
    const guardConditions = (
      Object.entries(input.guard) as [
        keyof ContactInboxIdentityFields,
        string | null | undefined,
      ][]
    ).flatMap(([field, value]) => {
      if (value === undefined) {
        return []
      }
      const column = contactInboxIdentityColumns[field]
      return [value === null ? isNull(column) : eq(column, value)]
    })
    if (guardConditions.length === 0) {
      throw new Error("ContactInbox identity update requires a guard")
    }

    const [updated] = await tx
      .update(contactInboxModel)
      .set({
        ...input.set,
        ...(input.appendIdentityHistory
          ? {
              sourceIdentityHistory: appendIdentityHistoryExpression(
                input.appendIdentityHistory,
              ),
            }
          : {}),
      })
      .where(and(eq(contactInboxModel.id, input.id), ...guardConditions))
      .returning()

    return updated
  },

  listWithInboxNameByContactId(
    input: { contactId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return tx.query.contactInboxModel.findMany({
      where: {
        contactId: input.contactId,
        inbox: { workspaceId: input.workspaceId },
      },
      orderBy: { id: "asc" },
      columns: {
        id: true,
        contactId: true,
        inboxId: true,
        channel: true,
        source: true,
        sourceId: true,
        sourceUserId: true,
        sourceUsername: true,
        language: true,
        lastIncomingMessageAt: true,
        contactLastReadAt: true,
      },
      with: { inbox: { columns: { name: true } } },
    })
  },
  /**
   * Resolves a batch of channel-side ids (`sourceId` — a WhatsApp `wa_id`, a
   * Messenger PSID, …) to their ContactInbox rows within ONE inbox, in a single
   * round trip. Rows with a null `sourceId` cannot be addressed this way and
   * are dropped.
   *
   * A missing key is meaningful to the caller, not an error: the WhatsApp
   * coexist flush uses it to tell "Meta delivered a patch before the message it
   * targets" (carry the patch, retry next flush) from "resolved".
   */
  async findByInboxAndSourceIds(
    input: { inboxId: string; sourceIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxBySourceIdRow[]> {
    const sourceIds = Array.from(new Set(input.sourceIds))
    if (sourceIds.length === 0) {
      return []
    }
    const rows = await tx
      .select({
        id: contactInboxModel.id,
        sourceId: contactInboxModel.sourceId,
        lastIncomingMessageAt: contactInboxModel.lastIncomingMessageAt,
        createdAt: contactInboxModel.createdAt,
      })
      .from(contactInboxModel)
      .where(
        and(
          eq(contactInboxModel.inboxId, input.inboxId),
          inArray(contactInboxModel.sourceId, sourceIds),
        ),
      )

    return rows.filter((row) => Boolean(row.sourceId))
  },

  /**
   * Single-row, workspace-scoped load of a contact inbox by id — the cheap
   * "does this contact inbox even exist / what channel is it" lookup, so a
   * non-eligible-channel contact inbox costs exactly one indexed lookup
   * (primary key join to Inbox for workspace scoping) before returning.
   * `channel` is returned as the raw `text()` column value — callers narrow
   * it with `isAdsEligibleChannel`.
   */
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxWorkspaceRow | null> {
    const [row] = await tx
      .select(contactInboxWorkspaceRowColumns)
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(contactInboxModel.id, input.id))
      .limit(1)

    return row ?? null
  },

  /**
   * Single-row, workspace- AND contact-scoped load of a contact inbox by id —
   * used by `resolveActionContactInbox` to validate a `contactInboxId`
   * threaded from a trigger event before trusting it as the Trigger action's
   * attribution target. The extra `contactId` predicate (beyond the
   * `findByIdForWorkspace` join) guards against a stale/foreign id (e.g. a
   * contact-merge or an id from a different contact) silently attributing to
   * the wrong contact's inbox — the caller falls back to
   * `findMostRecentByContact` when this returns `null`.
   */
  async findByIdForContact(
    input: { id: string; contactId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxWorkspaceRow | null> {
    const [row] = await tx
      .select(contactInboxWorkspaceRowColumns)
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(contactInboxModel.id, input.id),
          eq(contactInboxModel.contactId, input.contactId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /**
   * Workspace-scoped "most recently active inbox" for a contact — the
   * fallback `resolveActionContactInbox` uses when no producer threaded a
   * `contactInboxId` (schema-precludes-attribution events like
   * `dateTimeBasedTrigger`, or a stale/foreign threaded id). Replaces a
   * `db.query.contactInboxModel.findFirst({ orderBy: { lastMessageAt:
   * "desc" } })` call; `NULLS LAST` is explicit because Postgres sorts nulls
   * FIRST on `DESC` by default, which would prefer an inbox that never had a
   * message.
   */
  async findMostRecentByContact(
    input: { contactId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxWorkspaceRow | null> {
    const [row] = await tx
      .select(contactInboxWorkspaceRowColumns)
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(contactInboxModel.contactId, input.contactId))
      .orderBy(mostRecentMessageFirst())
      .limit(1)

    return row ?? null
  },

  /**
   * Every WhatsApp contact-inbox for a contact that carries CTWA (click-to-
   * WhatsApp ad) attribution, paired with the WhatsApp integration that owns
   * it. Used by the `tagApplied` conversion-trigger hook points: a tag is
   * attached to a *contact*, not a specific conversation, so unlike
   * keywordMatched/contactReplied (which already have a contactInbox in
   * scope) this has to fan out to every ad-attributed inbox the contact has.
   */
  async listWhatsappCtwaInboxesByContact(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCtwaInboxRow[]> {
    const rows = await tx
      .select({
        contactInboxId: contactInboxModel.id,
        integrationWhatsappId: integrationWhatsappModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(contactInboxModel.contactId, input.contactId),
          eq(contactInboxModel.channel, "whatsapp"),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )

    return rows
  },

  /**
   * Batch sibling of `listWhatsappCtwaInboxesByContact` for many contacts at
   * once — one query instead of one-per-contact. Used by the bulk tag-attach
   * paths (tagService.bulkAttachToContacts/attachToContact, the builder bulk
   * contact-tag actions) so a chunk of N contacts costs a single round trip
   * instead of N.
   */
  async listWhatsappCtwaInboxesByContacts(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCtwaInboxByContactRow[]> {
    if (input.contactIds.length === 0) {
      return []
    }

    const rows = await tx
      .select({
        contactId: contactInboxModel.contactId,
        contactInboxId: contactInboxModel.id,
        integrationWhatsappId: integrationWhatsappModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          inArray(contactInboxModel.contactId, input.contactIds),
          eq(contactInboxModel.channel, "whatsapp"),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )

    return rows
  },

  /**
   * Channel-generalized sibling of `listWhatsappCtwaInboxesByContacts`
   * (Phase 3): every whatsapp/messenger/instagram contact-inbox for a batch
   * of contacts that carries ads attribution, paired with the integration
   * that owns it. Used by `enqueueTagAppliedEvaluationsBulk` — a tag is
   * attached to a *contact*, not a specific conversation, so this fans out
   * to every ad-attributed inbox the contact has across all 3 ads-eligible
   * channels. WhatsApp keys attribution on `referral.ctwaClid`; messenger/
   * instagram have no click-id equivalent, so they key on
   * `referral.adId` + `referral.source === "ADS"` (see
   * `adsConversionEventRepository.findAttributionByAdReferral`). Three
   * per-channel queries — generated by iterating `adEligibleInboxChannelConfigs`
   * — run in parallel and are merged in JS: the join target (integration
   * table) differs per channel, which does not fit a single typed Drizzle
   * query.
   */
  async listAdEligibleInboxesByContacts(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<AdEligibleInboxByContactRow[]> {
    if (input.contactIds.length === 0) {
      return []
    }

    const perChannelRows = await Promise.all(
      Object.values(adEligibleInboxChannelConfigs).map(async (config) => {
        const model = config.model()
        const rows = await tx
          .select({
            contactId: contactInboxModel.contactId,
            contactInboxId: contactInboxModel.id,
            integrationId: model.id,
          })
          .from(contactInboxModel)
          .innerJoin(
            model,
            and(
              eq(contactInboxModel.inboxId, model.inboxId),
              eq(model.workspaceId, input.workspaceId),
            ),
          )
          .where(
            and(
              inArray(contactInboxModel.contactId, input.contactIds),
              eq(contactInboxModel.channel, config.channel),
              ...config.referralConditions(),
            ),
          )

        return rows.map((row) => ({ ...row, channel: config.channel }))
      }),
    )

    return perChannelRows.flat()
  },

  /**
   * Resolve a contact inbox with its `conversation` + `contact` relations,
   * by an arbitrary `where` (e.g. `{ inboxId, sourceId }` or
   * `{ inboxId, sourceUserId }`) — used by `message-status.ts`'s
   * `resolveStatusContactInbox` behind `resolveSourceScopedIdentityMatch`.
   * Keep the caller's probe order/spread exactly as-is; this repo method
   * only executes one shape of the query.
   */
  findWithConversationAndContact(
    props: { where: Record<string, unknown> },
    tx: DatabaseClient = db,
  ): Promise<
    | (ContactInboxModel & {
        conversation: ConversationModel | null
        contact: ContactModel
      })
    | undefined
  > {
    return tx.query.contactInboxModel.findFirst({
      where: props.where,
      columns: contactInboxOperationalColumns,
      with: { conversation: true, contact: true },
    }) as Promise<
      | (ContactInboxModel & {
          conversation: ConversationModel | null
          contact: ContactModel
        })
      | undefined
    >
  },

  /**
   * Resolve a contact inbox with its `contact` relation, by an arbitrary
   * `where` — used by `received-message.ts`'s `resolveExistingContactInbox`
   * behind `resolveSourceScopedIdentityMatch`. Keep the caller's
   * `{ inboxId, channel, ...where }` spread and probe order exactly as-is.
   */
  findWithContact(
    props: { where: Record<string, unknown> },
    tx: DatabaseClient = db,
  ): Promise<(ContactInboxModel & { contact: ContactModel }) | undefined> {
    return tx.query.contactInboxModel.findFirst({
      where: props.where,
      columns: contactInboxOperationalColumns,
      with: { contact: true },
    }) as Promise<(ContactInboxModel & { contact: ContactModel }) | undefined>
  },

  /**
   * Resolve `{ id, contactId }` for contact inboxes matching an inbox +
   * source-id list — used by `inbox_labels/sync.ts`'s `findInboxes` to map
   * external label event user ids to local contacts.
   */
  listIdsByInboxAndSourceIds(
    props: { inboxId: string; sourceIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<Pick<ContactInboxModel, "id" | "contactId">[]> {
    return tx.query.contactInboxModel.findMany({
      where: { inboxId: props.inboxId, sourceId: { in: props.sourceIds } },
      columns: { id: true, contactId: true },
    })
  },

  /**
   * Map `sourceId → { id, lastIncomingMessageAt, createdAt }` for an inbox —
   * used by `coexist/whatsapp-flush.ts` to resolve identity columns for a
   * batch of staged contacts.
   */
  listIdentityColumnsByInboxAndSourceIds(
    props: { inboxId: string; sourceIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<
    Pick<
      ContactInboxModel,
      "id" | "sourceId" | "lastIncomingMessageAt" | "createdAt"
    >[]
  > {
    if (props.sourceIds.length === 0) {
      return Promise.resolve([])
    }
    return tx.query.contactInboxModel.findMany({
      where: { inboxId: props.inboxId, sourceId: { in: props.sourceIds } },
      columns: {
        id: true,
        sourceId: true,
        lastIncomingMessageAt: true,
        createdAt: true,
      },
    })
  },

  /**
   * Single-row load of a contact inbox by id together with its conversation —
   * deliberately NOT workspace-scoped in the query itself. Used by the public
   * `/r/[workspaceId]/[name]` magic-link route, which validates the caller's
   * workspace by comparing `conversation.workspaceId` against the route's
   * `workspaceId` at the call site instead: filtering by workspace here would
   * make a cross-workspace inbox indistinguishable from "inbox gone" and lose
   * the ability to log which workspace the mismatched inbox actually belongs
   * to.
   */
  async findByIdWithConversation(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<
    (ContactInboxModel & { conversation: ConversationModel | null }) | undefined
  > {
    return await tx.query.contactInboxModel.findFirst({
      where: { id: input.id },
      with: {
        conversation: true,
      },
    })
  },

  /**
   * `sync-channel-labels.ts` scan page: every contact inbox on one inbox,
   * keyset-paginated by id. Returns full rows (the handler reads `sourceId`,
   * `contactId`, etc. off the whole model when scanning).
   */
  async listByInboxPage(
    input: { inboxId: string; afterId?: string; limit: number },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.contactInboxModel.findMany({
      where: {
        inboxId: input.inboxId,
        ...(input.afterId ? { id: { gt: input.afterId } } : {}),
      },
      orderBy: { id: "asc" },
      limit: input.limit,
    })
  },

  /**
   * `sync-tag.ts` delete path: resolves the distinct contact ids owning a
   * page of contact-inbox ids, so the caller can prune `ContactsToTags` rows
   * for exactly those contacts.
   */
  async listContactIdsByIds(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<{ contactId: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx.query.contactInboxModel.findMany({
      where: { id: { in: input.ids } },
      columns: { contactId: true },
    })
  },

  /**
   * `sync-tag.ts` attach path: every contact-inbox for a contact, with no
   * `workspaceId` filter (the caller has only a `contactId` in scope at this
   * point). Distinct from `contactInboxService.listByContactId`, which
   * requires `workspaceId` and is cached — this is an uncached, unscoped
   * operational-row read.
   */
  async listByContactId(
    input: { contactId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel[]> {
    return (await tx.query.contactInboxModel.findMany({
      where: { contactId: input.contactId },
      columns: contactInboxOperationalColumns,
    })) as ContactInboxModel[]
  },

  /**
   * One guarded `UPDATE ... RETURNING`: applies a thread-control event only
   * when it is not stale (see `threadControlTransitionGuard`). Every non-stale
   * event advances `threadControlUpdatedAt`, even when the state is unchanged,
   * so a later-arriving older event can never overwrite a newer same-state one.
   * Scoped to the workspace through the owning Inbox (ContactInbox has no
   * `workspaceId`). Returns the updated row, or `null` when the event was
   * stale or the contact inbox is not in the workspace.
   */
  async applyThreadControlTransition(
    input: ApplyThreadControlTransitionInput,
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel | null> {
    const state = THREAD_CONTROL_TRANSITIONS[input.event]
    const [row] = await tx
      .update(contactInboxModel)
      .set({
        threadControlState: state,
        threadOwnerRole: input.ownerRole,
        threadOwnerAppId: input.ownerAppId ?? null,
        threadPreviousOwnerAppId: input.previousOwnerAppId ?? null,
        threadControlUpdatedAt: input.occurredAt,
        threadControlLastEvent: input.event,
        ...(input.threadOwnerExpiresAt === undefined
          ? {}
          : { threadOwnerExpiresAt: input.threadOwnerExpiresAt }),
      })
      .where(
        and(
          eq(contactInboxModel.id, input.id),
          exists(
            tx
              .select({ one: sql`1` })
              .from(inboxModel)
              .where(
                and(
                  eq(inboxModel.id, contactInboxModel.inboxId),
                  eq(inboxModel.workspaceId, input.workspaceId),
                ),
              ),
          ),
          threadControlTransitionGuard(input, state),
        ),
      )
      .returning()

    return row ?? null
  },

  /**
   * Records the owner delivery of a message first stored from its standby
   * copy, at the standby copy's OWN time (`occurredAt`; the event time is never
   * advanced, so a handover of the same Meta second can never be leapfrogged).
   * `inboundReceived` is the lowest precedence, so the normal guard rejects it
   * against the `standbyReceived` copy; this dedicated write bypasses that for
   * exactly one case: the row is still the standby copy (`standbyReceived` at
   * `occurredAt`). Any other row (a handover already recorded at that second,
   * a later event, or an already-promoted copy) returns `null`, and a handover
   * processed AFTER this write outranks `inboundReceived` through the normal
   * guard - so a handover wins in both processing orders.
   * Workspace-scoped through the owning Inbox.
   */
  async promoteStandbyToOwnerDelivery(
    input: {
      id: string
      workspaceId: string
      ownerRole: ThreadControlRole | null
      previousOwnerAppId?: string | null
      threadOwnerExpiresAt?: Date | null | undefined
      occurredAt: Date
    },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel | null> {
    const [row] = await tx
      .update(contactInboxModel)
      .set({
        threadControlState: THREAD_CONTROL_TRANSITIONS.inboundReceived,
        threadOwnerRole: input.ownerRole,
        threadOwnerAppId: null,
        threadPreviousOwnerAppId: input.previousOwnerAppId ?? null,
        threadControlUpdatedAt: input.occurredAt,
        threadControlLastEvent: "inboundReceived",
        ...(input.threadOwnerExpiresAt === undefined
          ? {}
          : { threadOwnerExpiresAt: input.threadOwnerExpiresAt }),
      })
      .where(
        and(
          eq(contactInboxModel.id, input.id),
          eq(contactInboxModel.threadControlLastEvent, "standbyReceived"),
          eq(contactInboxModel.threadControlUpdatedAt, input.occurredAt),
          exists(
            tx
              .select({ one: sql`1` })
              .from(inboxModel)
              .where(
                and(
                  eq(inboxModel.id, contactInboxModel.inboxId),
                  eq(inboxModel.workspaceId, input.workspaceId),
                ),
              ),
          ),
        ),
      )
      .returning()

    return row ?? null
  },

  /**
   * Stores the channel-reported expiry on a thread that is still standby under
   * the given owner app, without touching ownership or the transition clock.
   * `observedUpdatedAt` is the ownership version the channel answer was
   * fetched against: the write applies only while it is unchanged, so an
   * A -> us -> A change during the fetch cannot let a stale expiry land.
   * Workspace-scoped through the owning Inbox. Returns `null` when the thread
   * moved on (no longer that standby owner/version) or is not in the workspace.
   */
  async setStandbyThreadOwnerExpiresAt(
    input: {
      id: string
      workspaceId: string
      ownerAppId: string | null
      observedUpdatedAt: Date | null
      threadOwnerExpiresAt: Date | null
    },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel | null> {
    const [row] = await tx
      .update(contactInboxModel)
      .set({ threadOwnerExpiresAt: input.threadOwnerExpiresAt })
      .where(
        and(
          eq(contactInboxModel.id, input.id),
          eq(contactInboxModel.threadControlState, "standby"),
          sql`${contactInboxModel.threadOwnerAppId} IS NOT DISTINCT FROM ${input.ownerAppId}`,
          input.observedUpdatedAt
            ? eq(
                contactInboxModel.threadControlUpdatedAt,
                input.observedUpdatedAt,
              )
            : isNull(contactInboxModel.threadControlUpdatedAt),
          exists(
            tx
              .select({ one: sql`1` })
              .from(inboxModel)
              .where(
                and(
                  eq(inboxModel.id, contactInboxModel.inboxId),
                  eq(inboxModel.workspaceId, input.workspaceId),
                ),
              ),
          ),
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Full-row, workspace-scoped load by id (workspace resolved through the
   * owning Inbox). `requestAction` needs the whole row to address the channel
   * and to compute the pre-transition thread state. `null` when the id is
   * unknown or belongs to another workspace.
   */
  async findModelByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxModel | null> {
    const [row] = await tx
      .select({ contactInbox: contactInboxModel })
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(contactInboxModel.id, input.id))
      .limit(1)

    return row?.contactInbox ?? null
  },

  /**
   * One query for archive-release: the contact inboxes of `contactIds` whose
   * stored state is `owned`. The stored state can be older than 24h of user
   * silence, so the caller must still filter through `resolveThreadControlState`.
   */
  async listThreadControlledByContactIds(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<ThreadControlledContactInboxRow[]> {
    if (input.contactIds.length === 0) {
      return []
    }
    return await tx
      .select({
        id: contactInboxModel.id,
        contactId: contactInboxModel.contactId,
        inboxId: contactInboxModel.inboxId,
        channel: contactInboxModel.channel,
        threadControlState: contactInboxModel.threadControlState,
        threadControlUpdatedAt: contactInboxModel.threadControlUpdatedAt,
        threadOwnerExpiresAt: contactInboxModel.threadOwnerExpiresAt,
        lastIncomingMessageAt: contactInboxModel.lastIncomingMessageAt,
      })
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          inArray(contactInboxModel.contactId, input.contactIds),
          eq(contactInboxModel.threadControlState, "owned"),
        ),
      )
  },
  /**
   * One keyset page of the threads a bulk AI hand-over run acts on in a single inbox,
   * ordered by contact-inbox id. The conversation is joined here (the direct
   * message one) so the run never resolves it per contact; a contact without
   * one is not eligible, and no conversation is ever created by a run. The
   * workspace scope is enforced through the conversation's own workspaceId.
   */
  async listBulkAiPage(
    input: BulkEligibilityInput & {
      workspaceId: string
      inboxId: string
      afterId: string | null
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<BulkAiContactInboxRow[]> {
    return await tx
      .select({
        ...getTableColumns(contactInboxModel),
        conversationId: conversationModel.id,
      })
      .from(contactInboxModel)
      .innerJoin(conversationModel, bulkConversationJoin(input.workspaceId))
      .where(bulkEligibilityWhere(input.inboxId, input, input.afterId))
      .orderBy(contactInboxModel.id)
      .limit(input.limit)
  },

  /** Of `ids`, those still eligible right now (the pre-dispatch re-check). */
  async listStillBulkAiEligible(
    input: BulkEligibilityInput & { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: contactInboxModel.id })
      .from(contactInboxModel)
      .innerJoin(conversationModel, bulkConversationJoin(input.workspaceId))
      .where(
        and(
          inArray(contactInboxModel.id, input.ids),
          ...bulkEligibilityConditions(input),
        ),
      )
    return rows.map((row) => row.id)
  },

  /** Eligible threads of one inbox after `afterId` (all when absent). */
  async countBulkAiEligible(
    input: BulkEligibilityInput & {
      workspaceId: string
      inboxId: string
      afterId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(contactInboxModel)
      .innerJoin(conversationModel, bulkConversationJoin(input.workspaceId))
      .where(bulkEligibilityWhere(input.inboxId, input, input.afterId ?? null))
    return row?.total ?? 0
  },
}
