import {
  type AdReferralChannelType,
  DEFAULT_ADS_CONVERSION_CHANNEL,
} from "@chatbotx.io/utils/channel"
import type { IndexColumn } from "drizzle-orm/pg-core"
import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  eq,
  gt,
  gte,
  isNull,
  lte,
  type SQL,
  sql,
} from "../../client"
import {
  adReferralPredicate,
  buildCtwaSegmentPredicate,
} from "../../queries/contact-filter/ctwa-retarget"
import type {
  AdsConversionCapiStatus,
  AdsConversionChannel,
} from "../../schema"
import {
  adsConversionEventModel,
  contactInboxModel,
  contactModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
import type { AdsConversionEventModel, ContactInboxModel } from "../../types"
import type { AdEligibleInboxChannel } from "../contact-inbox/repository"

export type AdsConversionEventCreateValues = Omit<
  typeof adsConversionEventModel.$inferInsert,
  "id"
>

export type AdsConversionEventAttribution = Pick<
  ContactInboxModel,
  "id" | "referral"
> & {
  wabaId: string
}

/**
 * Messenger/Instagram attribution shape returned by
 * `findAttributionByAdReferral` — unlike WhatsApp there is no per-channel
 * `wabaId`-equivalent identity column, so this is just the attributed
 * contact inbox row.
 */
export type AdReferralAttribution = Pick<ContactInboxModel, "id" | "referral">

type FindWorkspaceEventInput = {
  id: string
  workspaceId: string
}

type UpdateCapiStatusInput = FindWorkspaceEventInput & {
  from: Extract<AdsConversionCapiStatus, "pending">
  to: Exclude<AdsConversionCapiStatus, "pending">
  capiSentAt?: Date
}

export type CtwaConversationCountByAd = {
  adId: string | null
  conversations: number
}

export type CtwaConversationCountByDayAndAd = {
  date: string
  adId: string | null
  conversations: number
}

export type AdConversationCountByAd = {
  adId: string | null
  conversations: number
}

export type AdConversationCountByDayAndAd = {
  date: string
  adId: string | null
  conversations: number
}

/**
 * "All channels" (Ads Analytics default) conversation counts — grouped by
 * `(adId, channel)` unlike every other conversation-count method here (which
 * are one-channel-at-a-time). Per-ad IDENTITY still stays `adId` upstream:
 * the business layer folds these `(adId, channel)` groups into its existing
 * `adId`-keyed funnel map, collecting each ad's distinct channel set as a
 * passenger label rather than splitting the row.
 */
export type AllChannelConversationCountByAd = {
  adId: string | null
  channel: string
  conversations: number
}

export type AllChannelConversationCountByDayAndAd = {
  date: string
  adId: string | null
  channel: string
  conversations: number
}

export type AdsConversionEventCountByAd = {
  adId: string | null
  eventType: "lead" | "purchase"
  count: number
  purchaseValue: string | null
  /** Only populated when the query ran with `allChannels: true`. */
  channel?: AdsConversionChannel
}

export type AdsConversionEventCountByDayAndAd = {
  date: string
  adId: string | null
  eventType: "lead" | "purchase"
  count: number
  /** Only populated when the query ran with `allChannels: true`. */
  channel?: AdsConversionChannel
}

export type AdsConversionCapiStatusCount = {
  capiStatus: AdsConversionCapiStatus
  count: number
}

export type AdsConversionExportSegment = "conversations" | "leads" | "purchases"

export type AdsConversionExportRow = {
  contactId: string
  contactName: string | null
  phoneNumber: string | null
  email: string | null
  adId: string | null
  occurredAt: Date
  /**
   * Only populated when `listExportSegmentRows` ran with `allChannels: true`
   * (the analytics-only "All channels" export mode) — the row's REAL
   * channel, since a single request no longer scopes every row to one
   * channel. Absent for every legacy (single-channel) export call.
   */
  channel?: string
}

type DateRangeInput = {
  workspaceId: string
  since: Date
  until: Date
  integrationWhatsappId?: string
  /**
   * Additive channel scoping (Phase 2 generalization). Omitted = existing
   * WhatsApp-only behavior — every pre-Phase-1 caller keeps working
   * unchanged since `channel` is never mixed into the `integrationWhatsappId`
   * predicate below.
   */
  channel?: AdsConversionChannel
  integrationMessengerId?: string
  integrationInstagramId?: string
  /**
   * "All channels" (Ads Analytics default) — drops the channel eq-filter in
   * `dateRangeEventFilters` entirely instead of resolving to the
   * `DEFAULT_ADS_CONVERSION_CHANNEL` whatsapp fallback. Deliberately a
   * SEPARATE flag rather than an `"all"` `channel` value: `channel` stays a
   * real `AdsConversionChannel` everywhere, so every DB-facing
   * `Record<AdsConversionChannel, ...>`/enum stays exhaustive. Falsy
   * (undefined) keeps every existing caller's query byte-identical.
   */
  allChannels?: boolean
  /**
   * Viewer IANA timezone for the day-bucketed (`...ByDayAndAd`) siblings'
   * `AT TIME ZONE` bucketing — mirrors
   * `message-stats.repository.ts`'s `AT TIME ZONE ${timezone}` pattern.
   * Omitted defaults to `"UTC"` at each call site, so every pre-migration
   * caller keeps its exact prior bucketing behavior. Ignored by the
   * non-day-bucketed siblings (`countCtwaConversationsByAd`,
   * `countAdConversationsByAd`, `countAllChannelConversationsByAd`,
   * `countConversionEventsByAd`, `countByCapiStatus`) — only the [since,
   * until] window (already timezone-anchored by the caller) matters there.
   */
  timezone?: string
}

type AdConversationDateRangeInput = {
  workspaceId: string
  since: Date
  until: Date
  channel: Extract<AdsConversionChannel, AdReferralChannelType>
  integrationMessengerId?: string
  integrationInstagramId?: string
  /** See `DateRangeInput.timezone`. */
  timezone?: string
}

type ExportSegmentInput = DateRangeInput & {
  segment: AdsConversionExportSegment
  adId?: string | null
  afterId?: string
  limit: number
}

// Mirrors the 3 partial unique indexes on AdsConversionEvent (see the model
// comment in schema/ads-conversion-event.ts): one conflict target per
// channel, each scoped to that channel's own integration FK column via a
// `WHERE channel = '<x>'` target predicate — Drizzle's `onConflictDoNothing`
// forwards `where` straight into `ON CONFLICT (...) WHERE ... DO NOTHING`,
// which is required here since a plain composite target would never match a
// *partial* unique index. "facebook" has no AdsConversionEvent rows (dead
// channel, no partial index for it — see the CHECK constraint), so
// `getConflictTarget` early-returns null for it before ever consulting the
// map below — adding a channel here means adding it to the map AND to
// `AdEligibleInboxChannel`, or this early return needs revisiting.
//
// Map of FACTORY functions (not a module-scope object of pre-built
// ConflictTarget values): building the `sql` where-clauses eagerly at import
// time would run `sql` before test suites that mock
// `@chatbotx.io/database/client` without a `sql` export have a chance to —
// keeping each entry a function preserves that lazy, call-time-only
// evaluation.
type ConflictTarget = { target: IndexColumn[]; where: SQL }

const conflictTargetFactoryByChannel = {
  whatsapp: (): ConflictTarget => ({
    target: [
      adsConversionEventModel.workspaceId,
      adsConversionEventModel.integrationWhatsappId,
      adsConversionEventModel.source,
      adsConversionEventModel.sourceEventId,
    ],
    where: sql`${adsConversionEventModel.channel} = 'whatsapp'`,
  }),
  messenger: (): ConflictTarget => ({
    target: [
      adsConversionEventModel.workspaceId,
      adsConversionEventModel.integrationMessengerId,
      adsConversionEventModel.source,
      adsConversionEventModel.sourceEventId,
    ],
    where: sql`${adsConversionEventModel.channel} = 'messenger'`,
  }),
  instagram: (): ConflictTarget => ({
    target: [
      adsConversionEventModel.workspaceId,
      adsConversionEventModel.integrationInstagramId,
      adsConversionEventModel.source,
      adsConversionEventModel.sourceEventId,
    ],
    where: sql`${adsConversionEventModel.channel} = 'instagram'`,
  }),
} satisfies Record<AdEligibleInboxChannel, () => ConflictTarget>

function getConflictTarget(
  channel: AdsConversionChannel,
): ConflictTarget | null {
  if (channel === "facebook") {
    return null
  }

  return conflictTargetFactoryByChannel[channel]()
}

/**
 * Correlated `EXISTS` scope for `countAdConversationsByAd`/`ByDayAndAd`: an
 * integration owns exactly one inbox, so this matches
 * `contactInbox.inboxId = integration.inboxId AND id = X` the same way the
 * WhatsApp `innerJoin` variants elsewhere in this repository do — expressed
 * as raw SQL instead of a typed `innerJoin` so the messenger/instagram table
 * choice can be a runtime branch without fighting Drizzle's per-table join
 * generics.
 */
type AdReferralChannel = Extract<AdEligibleInboxChannel, AdReferralChannelType>

// Table each ad-referral channel's integration row lives in — shared by
// `adIntegrationScope` and `findAttributionByAdReferral` so both drive their
// table choice off the same one map entry per channel. A map of FACTORY
// functions (not a module-scope object of table references), same reasoning
// as `conflictTargetFactoryByChannel` above: dereferencing
// `integrationMessengerModel`/`integrationInstagramModel` eagerly at import
// time crashes test suites whose `@chatbotx.io/database/schema` mock
// doesn't export them — keeping each entry a function defers that
// dereference to call time, when only the branch actually taken resolves.
const adReferralIntegrationModelFactoryByChannel = {
  messenger: () => integrationMessengerModel,
  instagram: () => integrationInstagramModel,
} satisfies Record<
  AdReferralChannel,
  () => typeof integrationMessengerModel | typeof integrationInstagramModel
>

function adReferralIntegrationModel(channel: AdReferralChannel) {
  return adReferralIntegrationModelFactoryByChannel[channel]()
}

/**
 * Ad-referral attribution predicate pair (messenger/instagram — no
 * `ctwaClid` equivalent exists): `referral.adId` present + `referral.source
 * === "ADS"`. Kept LOCAL to this file (not shared with the identical pair in
 * `contact-inbox/repository.ts`) — importing across repository modules here
 * risks a circular import (`ads-conversion-event/repository.ts` already
 * imports from `contact-inbox/repository.ts` for `AdEligibleInboxChannel`,
 * and the reverse direction is plausible for a future shared helper module),
 * so each file keeps its own copy rather than reaching into the other.
 */
function adReferralConditions(): SQL[] {
  return [
    sql`${contactInboxModel.referral}->>'adId' IS NOT NULL`,
    sql`${contactInboxModel.referral}->>'source' = 'ADS'`,
  ]
}

function adReferralIntegrationId(
  input: Pick<
    AdConversationDateRangeInput,
    "channel" | "integrationMessengerId" | "integrationInstagramId"
  >,
): string | undefined {
  return input.channel === "messenger"
    ? input.integrationMessengerId
    : input.integrationInstagramId
}

function adIntegrationScope(
  input: AdConversationDateRangeInput,
): SQL | undefined {
  const integrationId = adReferralIntegrationId(input)
  if (!integrationId) {
    return
  }

  const model = adReferralIntegrationModel(input.channel)
  return sql`EXISTS (SELECT 1 FROM ${model} WHERE ${model.id} = ${integrationId} AND ${model.workspaceId} = ${input.workspaceId} AND ${model.inboxId} = ${contactInboxModel.inboxId})`
}

const adConversationBaseFilters = (input: AdConversationDateRangeInput) => [
  eq(contactModel.workspaceId, input.workspaceId),
  ...adReferralConditions(),
  gte(contactInboxModel.firstInteractionAt, input.since),
  lte(contactInboxModel.firstInteractionAt, input.until),
  // Channel scoping is REQUIRED (not just an optimization): messenger and
  // instagram share the same ad-referral predicate above, and
  // `ContactInbox.channel` is the only column distinguishing an
  // Instagram-via-Messenger inbox from a genuine Messenger one. Added
  // independent of whether an integration id narrows `adIntegrationScope`
  // below — otherwise a messenger query with no integration id selected
  // would also count instagram ad conversations (and vice versa).
  eq(contactInboxModel.channel, input.channel),
  adIntegrationScope(input),
]

/**
 * Shared `AdsConversionEvent` date-range + integration filters for
 * `countConversionEventsByAd`/`ByDayAndAd`/`countByCapiStatus`.
 *
 * `channel` omitted resolves to `'whatsapp'` — NOT "all channels". Every
 * pre-Phase-1 caller omits it and expects WhatsApp-only numbers; since all
 * pre-migration rows are backfilled `channel='whatsapp'`, the resolved
 * filter returns exactly what those callers always got, while keeping
 * post-flip messenger/instagram events from silently inflating their counts.
 */
const dateRangeEventFilters = (input: DateRangeInput) => [
  eq(adsConversionEventModel.workspaceId, input.workspaceId),
  gte(adsConversionEventModel.occurredAt, input.since),
  lte(adsConversionEventModel.occurredAt, input.until),
  input.integrationWhatsappId
    ? eq(
        adsConversionEventModel.integrationWhatsappId,
        input.integrationWhatsappId,
      )
    : undefined,
  // `allChannels` drops this eq-filter entirely — the ONLY way "no channel
  // filter" is reached. `channel` omitted WITHOUT `allChannels` still
  // resolves to the whatsapp default below, unchanged for every existing
  // caller (insertIgnoreDuplicate's conflict-target selection relies on this
  // same default and is untouched by this flag).
  input.allChannels
    ? undefined
    : eq(
        adsConversionEventModel.channel,
        input.channel ?? DEFAULT_ADS_CONVERSION_CHANNEL,
      ),
  input.integrationMessengerId
    ? eq(
        adsConversionEventModel.integrationMessengerId,
        input.integrationMessengerId,
      )
    : undefined,
  input.integrationInstagramId
    ? eq(
        adsConversionEventModel.integrationInstagramId,
        input.integrationInstagramId,
      )
    : undefined,
]

export const adsConversionEventRepository = {
  async insertIgnoreDuplicate(
    values: AdsConversionEventCreateValues,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    // `channel` has a DB default ("whatsapp"), which makes it optional on
    // the insert type — but the conflict target must be picked at the JS
    // layer, so an omitted value here falls back to that same default
    // rather than throwing for a value the DB itself would have defaulted.
    const conflict = getConflictTarget(
      values.channel ?? DEFAULT_ADS_CONVERSION_CHANNEL,
    )
    if (!conflict) {
      throw new Error(
        `insertIgnoreDuplicate: no dedup unique index for channel "${values.channel}"`,
      )
    }

    const [row] = await tx
      .insert(adsConversionEventModel)
      .values(values)
      .onConflictDoNothing({
        target: conflict.target,
        where: conflict.where,
      })
      .returning()

    return row ?? null
  },

  /**
   * Looks up an event by its deterministic `sourceEventId` (the same unique
   * key `insertIgnoreDuplicate` conflicts on). Used by the generic trigger
   * evaluator's find-or-create path: when the insert is deduped (the event
   * already exists from a previous evaluation), this recovers the row so its
   * `sendConversionEvent` job can still be (re-)enqueued idempotently — the
   * safety net for an enqueue that failed after a prior insert succeeded.
   */
  async findBySourceEventId(
    input: {
      workspaceId: string
      // `integrationWhatsappId` stays for backward compat with existing
      // WhatsApp callers; `channel`/`integrationMessengerId`/
      // `integrationInstagramId` are additive (Phase 2 generalization).
      // `sourceEventId` already embeds the rule + contactInbox id + UTC day,
      // so it is unique per workspace+source on its own — the integration
      // filter is defense-in-depth, not load-bearing, so any one (or none)
      // of the four id fields being provided is enough to disambiguate.
      integrationWhatsappId?: string
      channel?: AdsConversionChannel
      integrationMessengerId?: string
      integrationInstagramId?: string
      source: AdsConversionEventCreateValues["source"]
      sourceEventId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          eq(adsConversionEventModel.source, input.source),
          eq(adsConversionEventModel.sourceEventId, input.sourceEventId),
          input.integrationWhatsappId
            ? eq(
                adsConversionEventModel.integrationWhatsappId,
                input.integrationWhatsappId,
              )
            : undefined,
          input.channel
            ? eq(adsConversionEventModel.channel, input.channel)
            : undefined,
          input.integrationMessengerId
            ? eq(
                adsConversionEventModel.integrationMessengerId,
                input.integrationMessengerId,
              )
            : undefined,
          input.integrationInstagramId
            ? eq(
                adsConversionEventModel.integrationInstagramId,
                input.integrationInstagramId,
              )
            : undefined,
        ),
      )
      .limit(1)

    return row ?? null
  },

  async findAttributionByCtwaClid(
    input: {
      workspaceId: string
      integrationWhatsappId: string
      ctwaClid: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventAttribution | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        referral: contactInboxModel.referral,
        wabaId: integrationWhatsappModel.wabaId,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.id, input.integrationWhatsappId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        sql`${contactInboxModel.referral}->>'ctwaClid' = ${input.ctwaClid}`,
      )
      .limit(1)

    return row ?? null
  },

  async findAttributionByContactInbox(
    input: {
      workspaceId: string
      integrationWhatsappId: string
      contactInboxId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventAttribution | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        referral: contactInboxModel.referral,
        wabaId: integrationWhatsappModel.wabaId,
      })
      .from(contactInboxModel)
      .innerJoin(
        integrationWhatsappModel,
        and(
          eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
          eq(integrationWhatsappModel.id, input.integrationWhatsappId),
          eq(integrationWhatsappModel.workspaceId, input.workspaceId),
        ),
      )
      .where(
        and(
          eq(contactInboxModel.id, input.contactInboxId),
          sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
        ),
      )
      .limit(1)

    return row ?? null
  },

  /**
   * Messenger/Instagram counterpart to `findAttributionByContactInbox`: there
   * is no `ctwaClid` equivalent for CTM/CTID (see plan "Key verified facts"),
   * so attribution keys on the ad-referral fields Meta actually sends
   * (`referral.adId` + `referral.source === "ADS"`, SHORTLINK/ig.me traffic
   * excluded) instead of a click id.
   */
  async findAttributionByAdReferral(
    input: {
      workspaceId: string
      channel: Extract<AdsConversionChannel, AdReferralChannelType>
      integrationMessengerId?: string
      integrationInstagramId?: string
      contactInboxId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AdReferralAttribution | null> {
    const integrationId = adReferralIntegrationId(input)
    if (!integrationId) {
      return null
    }

    const adReferralFilter = and(
      eq(contactInboxModel.id, input.contactInboxId),
      // Channel guard: an IntegrationMessenger and IntegrationInstagram row
      // may reference the same inboxId, so the integration join alone can't
      // stop an instagram contact inbox from being attributed by a messenger
      // rule (or vice versa) — that would insert the conversion event under
      // the wrong channel. The aggregate count queries carry the same guard.
      eq(contactInboxModel.channel, input.channel),
      ...adReferralConditions(),
    )
    const selection = {
      id: contactInboxModel.id,
      referral: contactInboxModel.referral,
    }
    // Same channel→table map `adIntegrationScope` above drives its EXISTS
    // choice from — one map entry, not a per-channel query block.
    const model = adReferralIntegrationModel(input.channel)

    const [row] = await tx
      .select(selection)
      .from(contactInboxModel)
      .innerJoin(
        model,
        and(
          eq(contactInboxModel.inboxId, model.inboxId),
          eq(model.id, integrationId),
          eq(model.workspaceId, input.workspaceId),
        ),
      )
      .where(adReferralFilter)
      .limit(1)

    return row ?? null
  },

  listPendingCapi(
    workspaceId?: string,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel[]> {
    const filters = [
      eq(adsConversionEventModel.capiStatus, "pending"),
      isNull(adsConversionEventModel.capiSentAt),
      workspaceId
        ? eq(adsConversionEventModel.workspaceId, workspaceId)
        : undefined,
    ].filter((filter) => filter !== undefined)

    return tx
      .select()
      .from(adsConversionEventModel)
      .where(and(...filters))
      .orderBy(asc(adsConversionEventModel.occurredAt))
  },

  async findWorkspaceEvent(
    input: FindWorkspaceEventInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .select()
      .from(adsConversionEventModel)
      .where(
        and(
          eq(adsConversionEventModel.id, input.id),
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async updateCapiStatus(
    input: UpdateCapiStatusInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventModel | null> {
    const [row] = await tx
      .update(adsConversionEventModel)
      .set({
        capiStatus: input.to,
        capiSentAt: input.capiSentAt,
      })
      .where(
        and(
          eq(adsConversionEventModel.id, input.id),
          eq(adsConversionEventModel.workspaceId, input.workspaceId),
          eq(adsConversionEventModel.capiStatus, input.from),
        ),
      )
      .returning()

    return row ?? null
  },

  async countCtwaConversationsByAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<CtwaConversationCountByAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    const rows = input.integrationWhatsappId
      ? await tx
          .select({
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            integrationWhatsappModel,
            and(
              eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
              eq(integrationWhatsappModel.id, input.integrationWhatsappId),
              eq(integrationWhatsappModel.workspaceId, input.workspaceId),
            ),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(adIdExpression)
      : await tx
          .select({
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(adIdExpression)

    return rows.map((row) => ({
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  async countCtwaConversationsByDayAndAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<CtwaConversationCountByDayAndAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    // Explicit date bucketing pinned to `input.timezone` (default "UTC") via
    // AT TIME ZONE — `DATE(col)`/`col::date` depend on the session timezone
    // instead, so the day boundary must be pinned explicitly. Parameterized
    // (never string-interpolated) exactly like
    // `message-stats.repository.ts`'s `AT TIME ZONE ${timezone}`.
    const timezone = input.timezone ?? "UTC"
    const dateExpression = sql<string>`to_char(${contactInboxModel.firstInteractionAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`
    const rows = input.integrationWhatsappId
      ? await tx
          .select({
            date: dateExpression,
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            integrationWhatsappModel,
            and(
              eq(contactInboxModel.inboxId, integrationWhatsappModel.inboxId),
              eq(integrationWhatsappModel.id, input.integrationWhatsappId),
              eq(integrationWhatsappModel.workspaceId, input.workspaceId),
            ),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(dateExpression, adIdExpression)
      : await tx
          .select({
            date: dateExpression,
            adId: adIdExpression,
            conversations: count(contactInboxModel.id),
          })
          .from(contactInboxModel)
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(filters)
          .groupBy(dateExpression, adIdExpression)

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  /**
   * Messenger/Instagram counterpart to `countCtwaConversationsByAd`: same
   * "conversation" definition (one qualifying ContactInbox per ad, bucketed
   * by `firstInteractionAt`) but keyed on the ad-referral predicate
   * (`referral.adId` + `source === "ADS"`) instead of `ctwaClid`, since
   * neither channel has a click-id equivalent.
   */
  async countAdConversationsByAd(
    input: AdConversationDateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdConversationCountByAd[]> {
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`

    const rows = await tx
      .select({
        adId: adIdExpression,
        conversations: count(contactInboxModel.id),
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(and(...adConversationBaseFilters(input)))
      .groupBy(adIdExpression)

    return rows.map((row) => ({
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  /**
   * Day-bucketed sibling of `countAdConversationsByAd` — see its doc comment.
   *
   * Days are bucketed in `input.timezone` (default "UTC"), which the caller
   * resolves to the VIEWER's timezone (see `parseAnalyticsDateRange`) — while
   * Meta Insights buckets spend/impressions in the ad account's reporting
   * timezone (unavoidable, no per-request override). For a viewer whose
   * timezone differs from the ad account's, conversions near midnight can
   * still land on an adjacent chart day relative to the spend row they are
   * merged with — a residual, documented seam, not something bucketing alone
   * can close. See the "RESIDUAL SEAM" note in `ads-date-key.ts`.
   */
  async countAdConversationsByDayAndAd(
    input: AdConversationDateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdConversationCountByDayAndAd[]> {
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    // Explicit date bucketing pinned to `input.timezone` — see
    // countCtwaConversationsByDayAndAd.
    const timezone = input.timezone ?? "UTC"
    const dateExpression = sql<string>`to_char(${contactInboxModel.firstInteractionAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`

    const rows = await tx
      .select({
        date: dateExpression,
        adId: adIdExpression,
        conversations: count(contactInboxModel.id),
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(and(...adConversationBaseFilters(input)))
      .groupBy(dateExpression, adIdExpression)

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      conversations: Number(row.conversations),
    }))
  },

  /**
   * "All channels" (Ads Analytics default) conversation counts — reuses
   * `adReferralPredicate()`, the SAME ctwaClid-OR-ad-referral predicate
   * `buildCtwaSegmentPredicate` already uses for its "both channel and
   * integration omitted" case, rather than a parallel predicate. GROUP BY
   * `(adId, channel)`: per-ad identity stays `adId` upstream — the business
   * layer folds these rows into its `adId`-keyed funnel map, collecting each
   * ad's distinct channel set as a passenger label (spend from Facebook
   * Insights is per-`adId` only, so identity must never split by channel).
   */
  async countAllChannelConversationsByAd(
    input: Pick<DateRangeInput, "workspaceId" | "since" | "until">,
    tx: DatabaseClient = db,
  ): Promise<AllChannelConversationCountByAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      adReferralPredicate(),
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`

    const rows = await tx
      .select({
        adId: adIdExpression,
        channel: contactInboxModel.channel,
        conversations: count(contactInboxModel.id),
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(filters)
      .groupBy(adIdExpression, contactInboxModel.channel)

    return rows.map((row) => ({
      adId: row.adId,
      channel: row.channel,
      conversations: Number(row.conversations),
    }))
  },

  /** Day-bucketed sibling of `countAllChannelConversationsByAd` — see its doc comment. */
  async countAllChannelConversationsByDayAndAd(
    input: Pick<DateRangeInput, "workspaceId" | "since" | "until" | "timezone">,
    tx: DatabaseClient = db,
  ): Promise<AllChannelConversationCountByDayAndAd[]> {
    const filters = and(
      eq(contactModel.workspaceId, input.workspaceId),
      adReferralPredicate(),
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    )
    const adIdExpression = sql<
      string | null
    >`${contactInboxModel.referral}->>'adId'`
    // Explicit date bucketing pinned to `input.timezone` — see
    // countCtwaConversationsByDayAndAd.
    const timezone = input.timezone ?? "UTC"
    const dateExpression = sql<string>`to_char(${contactInboxModel.firstInteractionAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`

    const rows = await tx
      .select({
        date: dateExpression,
        adId: adIdExpression,
        channel: contactInboxModel.channel,
        conversations: count(contactInboxModel.id),
      })
      .from(contactInboxModel)
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .where(filters)
      .groupBy(dateExpression, adIdExpression, contactInboxModel.channel)

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      channel: row.channel,
      conversations: Number(row.conversations),
    }))
  },

  async countConversionEventsByAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventCountByAd[]> {
    const purchaseValueExpression = sql<string | null>`
          SUM(
            CASE
              WHEN ${adsConversionEventModel.eventType} = 'purchase'
              THEN ${adsConversionEventModel.value}
              ELSE NULL
            END
          )
        `

    // Branches on a full select/groupBy pair (not a shared query object with
    // a conditionally-appended column) so the `allChannels`-falsy path stays
    // byte-identical to the pre-"all channels" SQL/args — selecting an
    // ungrouped `channel` column would also be invalid SQL unless it were
    // always added to GROUP BY, which would change every existing caller's
    // query shape. Early-returns (not a shared ternary-merged `rows`
    // variable) so each branch's row shape stays its own concrete type
    // instead of widening to `unknown` through a heterogeneous union.
    if (input.allChannels) {
      const rows = await tx
        .select({
          adId: adsConversionEventModel.adId,
          eventType: adsConversionEventModel.eventType,
          channel: adsConversionEventModel.channel,
          count: count(adsConversionEventModel.id),
          purchaseValue: purchaseValueExpression,
        })
        .from(adsConversionEventModel)
        .where(and(...dateRangeEventFilters(input)))
        .groupBy(
          adsConversionEventModel.adId,
          adsConversionEventModel.eventType,
          adsConversionEventModel.channel,
        )

      return rows.map((row) => ({
        adId: row.adId,
        eventType: row.eventType,
        count: Number(row.count),
        purchaseValue: row.purchaseValue,
        channel: row.channel,
      }))
    }

    const rows = await tx
      .select({
        adId: adsConversionEventModel.adId,
        eventType: adsConversionEventModel.eventType,
        count: count(adsConversionEventModel.id),
        purchaseValue: purchaseValueExpression,
      })
      .from(adsConversionEventModel)
      .where(and(...dateRangeEventFilters(input)))
      .groupBy(adsConversionEventModel.adId, adsConversionEventModel.eventType)

    return rows.map((row) => ({
      adId: row.adId,
      eventType: row.eventType,
      count: Number(row.count),
      purchaseValue: row.purchaseValue,
    }))
  },

  async countConversionEventsByDayAndAd(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionEventCountByDayAndAd[]> {
    // Explicit date bucketing pinned to `input.timezone` — see
    // countCtwaConversationsByDayAndAd.
    const timezone = input.timezone ?? "UTC"
    const dateExpression = sql<string>`to_char(${adsConversionEventModel.occurredAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`

    // Same byte-identical-when-falsy, early-return branching as
    // countConversionEventsByAd.
    if (input.allChannels) {
      const rows = await tx
        .select({
          date: dateExpression,
          adId: adsConversionEventModel.adId,
          eventType: adsConversionEventModel.eventType,
          channel: adsConversionEventModel.channel,
          count: count(adsConversionEventModel.id),
        })
        .from(adsConversionEventModel)
        .where(and(...dateRangeEventFilters(input)))
        .groupBy(
          dateExpression,
          adsConversionEventModel.adId,
          adsConversionEventModel.eventType,
          adsConversionEventModel.channel,
        )

      return rows.map((row) => ({
        date: row.date,
        adId: row.adId,
        eventType: row.eventType,
        count: Number(row.count),
        channel: row.channel,
      }))
    }

    const rows = await tx
      .select({
        date: dateExpression,
        adId: adsConversionEventModel.adId,
        eventType: adsConversionEventModel.eventType,
        count: count(adsConversionEventModel.id),
      })
      .from(adsConversionEventModel)
      .where(and(...dateRangeEventFilters(input)))
      .groupBy(
        dateExpression,
        adsConversionEventModel.adId,
        adsConversionEventModel.eventType,
      )

    return rows.map((row) => ({
      date: row.date,
      adId: row.adId,
      eventType: row.eventType,
      count: Number(row.count),
    }))
  },

  async countByCapiStatus(
    input: DateRangeInput,
    tx: DatabaseClient = db,
  ): Promise<AdsConversionCapiStatusCount[]> {
    const rows = await tx
      .select({
        capiStatus: adsConversionEventModel.capiStatus,
        count: count(adsConversionEventModel.id),
      })
      .from(adsConversionEventModel)
      .where(and(...dateRangeEventFilters(input)))
      .groupBy(adsConversionEventModel.capiStatus)

    return rows.map((row) => ({
      capiStatus: row.capiStatus,
      count: Number(row.count),
    }))
  },

  async listExportSegmentRows(
    input: ExportSegmentInput,
    tx: DatabaseClient = db,
  ): Promise<Array<AdsConversionExportRow & { id: string }>> {
    if (input.segment === "conversations") {
      const filters = and(
        // Contact is in this query's FROM, so scope by workspace here — the
        // shared predicate omits `Contact.workspaceId` (see ctwa-retarget.ts).
        eq(contactModel.workspaceId, input.workspaceId),
        buildCtwaSegmentPredicate({
          segment: "conversations",
          adId: input.adId,
          since: input.since,
          until: input.until,
          workspaceId: input.workspaceId,
          integrationWhatsappId: input.integrationWhatsappId,
          channel: input.channel,
          integrationMessengerId: input.integrationMessengerId,
          integrationInstagramId: input.integrationInstagramId,
        }),
        input.afterId ? gt(contactInboxModel.id, input.afterId) : undefined,
      )
      const baseSelection = {
        id: contactInboxModel.id,
        contactId: contactModel.id,
        contactName: contactModel.fullName,
        phoneNumber: contactModel.phoneNumber,
        email: contactModel.email,
        adId: sql<string | null>`${contactInboxModel.referral}->>'adId'`,
        occurredAt: contactInboxModel.firstInteractionAt,
      }
      // Integration scope now lives in `buildCtwaSegmentPredicate` (a correlated
      // EXISTS), so the query no longer branches on `integrationWhatsappId`.
      // `allChannels` additionally selects the row's real channel (for the
      // CSV column) — branched the same "add the column only when needed"
      // way as countConversionEventsByAd, keeping the legacy shape/rows
      // returned by every existing caller unchanged.
      const rows = input.allChannels
        ? await tx
            .select({ ...baseSelection, channel: contactInboxModel.channel })
            .from(contactInboxModel)
            .innerJoin(
              contactModel,
              eq(contactModel.id, contactInboxModel.contactId),
            )
            .where(filters)
            .orderBy(asc(contactInboxModel.id))
            .limit(input.limit)
        : await tx
            .select(baseSelection)
            .from(contactInboxModel)
            .innerJoin(
              contactModel,
              eq(contactModel.id, contactInboxModel.contactId),
            )
            .where(filters)
            .orderBy(asc(contactInboxModel.id))
            .limit(input.limit)

      return rows.flatMap((row) =>
        row.occurredAt
          ? [
              {
                ...row,
                occurredAt: row.occurredAt,
              },
            ]
          : [],
      )
    }

    const eventFilters = and(
      buildCtwaSegmentPredicate({
        segment: input.segment,
        adId: input.adId,
        since: input.since,
        until: input.until,
        workspaceId: input.workspaceId,
        integrationWhatsappId: input.integrationWhatsappId,
        channel: input.channel,
        integrationMessengerId: input.integrationMessengerId,
        integrationInstagramId: input.integrationInstagramId,
      }),
      input.afterId ? gt(adsConversionEventModel.id, input.afterId) : undefined,
    )
    const baseEventSelection = {
      id: adsConversionEventModel.id,
      contactId: contactModel.id,
      contactName: contactModel.fullName,
      phoneNumber: contactModel.phoneNumber,
      email: contactModel.email,
      adId: adsConversionEventModel.adId,
      occurredAt: adsConversionEventModel.occurredAt,
    }

    return input.allChannels
      ? tx
          .select({
            ...baseEventSelection,
            channel: adsConversionEventModel.channel,
          })
          .from(adsConversionEventModel)
          .innerJoin(
            contactInboxModel,
            eq(contactInboxModel.id, adsConversionEventModel.contactInboxId),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(eventFilters)
          .orderBy(asc(adsConversionEventModel.id))
          .limit(input.limit)
      : tx
          .select(baseEventSelection)
          .from(adsConversionEventModel)
          .innerJoin(
            contactInboxModel,
            eq(contactInboxModel.id, adsConversionEventModel.contactInboxId),
          )
          .innerJoin(
            contactModel,
            eq(contactModel.id, contactInboxModel.contactId),
          )
          .where(eventFilters)
          .orderBy(asc(adsConversionEventModel.id))
          .limit(input.limit)
  },
}
