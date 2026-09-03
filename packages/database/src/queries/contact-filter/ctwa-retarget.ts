import { type AnyColumn, eq, gte, lte, type SQL, sql } from "drizzle-orm"
import type { AdEligibleInboxChannel } from "../../repositories/contact-inbox/repository"
import {
  type AdsConversionChannel,
  adsConversionEventModel,
  contactInboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"

// Table each ads-eligible channel's integration row lives in — the ONE map
// entry a future channel needs so `integrationInboxExists` below can resolve
// its EXISTS scope without a per-channel branch. A map of FACTORY functions
// (not a module-scope object of table references): dereferencing
// `integrationWhatsappModel`/`integrationMessengerModel`/
// `integrationInstagramModel` eagerly at import time crashes test suites
// whose `@chatbotx.io/database/schema` mock doesn't export all three —
// keeping each entry a function defers that dereference to call time, when
// only the branch actually taken resolves (same reasoning as
// `getConflictTarget` in the ads-conversion-event repository).
const integrationInboxModelFactoryByChannel = {
  whatsapp: () => integrationWhatsappModel,
  messenger: () => integrationMessengerModel,
  instagram: () => integrationInstagramModel,
} satisfies Record<
  AdEligibleInboxChannel,
  () =>
    | typeof integrationWhatsappModel
    | typeof integrationMessengerModel
    | typeof integrationInstagramModel
>

type IntegrationInboxModel = ReturnType<
  (typeof integrationInboxModelFactoryByChannel)[AdEligibleInboxChannel]
>

/**
 * Correlated `EXISTS` scope shared by every channel branch of
 * `buildConversationsPredicate`: an integration owns exactly one inbox, so
 * this matches `contactInbox.inboxId = integration.inboxId AND id = X`
 * (optionally also scoped to `workspaceId`, when the caller has it).
 */
function integrationInboxExists(
  model: IntegrationInboxModel,
  integrationId: string,
  workspaceId?: string,
): SQL {
  const scope = workspaceId
    ? sql`${model.id} = ${integrationId} AND ${model.workspaceId} = ${workspaceId} AND ${model.inboxId} = ${contactInboxModel.inboxId}`
    : sql`${model.id} = ${integrationId} AND ${model.inboxId} = ${contactInboxModel.inboxId}`
  return sql`EXISTS (SELECT 1 FROM ${model} WHERE ${scope})`
}

export const ctwaRetargetSegments = [
  "conversations",
  "leads",
  "purchases",
] as const
export type CtwaRetargetSegment = (typeof ctwaRetargetSegments)[number]

export type CtwaSegmentPredicateInput = {
  segment: CtwaRetargetSegment
  adId?: string | null
  since: Date
  until: Date
  /**
   * Optional workspace scope. Defensive + enables the workspace-prefixed
   * `AdsConversionEvent`/`Contact` indexes — callers that already scope the
   * outer query by workspace (e.g. the generic contact filter, where the
   * outer `Contact` row is already workspace-scoped) may omit it.
   */
  workspaceId?: string
  /**
   * Optional WhatsApp integration scope. REQUIRED for parity with the Facebook
   * custom-audience path: without it a contact whose CTWA activity/conversion
   * lives on integration B would still match a retarget scoped to integration
   * A (the contact only needs *some* qualifying inbox/event). Scopes
   * conversations to the integration's inbox and leads/purchases to
   * `AdsConversionEvent.integrationWhatsappId`. Safe against a foreign id — the
   * predicate is workspace-scoped, so a mismatched integration simply matches
   * nothing.
   */
  integrationWhatsappId?: string | null
  /**
   * Channel scoping (Phase 2 generalization). Three cases:
   *  - explicit channel: fully scoped to it (`ctwaClid` for whatsapp, the
   *    ad-referral predicate + `ContactInbox.channel` for
   *    messenger/instagram — there is no `ctwaClid` equivalent for
   *    CTM/CTID);
   *  - omitted WITH `integrationWhatsappId`: legacy WhatsApp caller —
   *    `ctwaClid`-keyed conversations, `channel='whatsapp'`-scoped events —
   *    every pre-generalization caller keeps working unchanged;
   *  - omitted with NO integration id: ANY channel (the saved
   *    contact-filter contract of `ctwaRetargetConditionSchema`) —
   *    `ctwaClid` OR ad-referral conversations, unfiltered-channel events.
   */
  channel?: AdsConversionChannel
  integrationMessengerId?: string | null
  integrationInstagramId?: string | null
}

const conversionEventTypeBySegment = {
  leads: "lead",
  purchases: "purchase",
} satisfies Record<
  Exclude<CtwaRetargetSegment, "conversations">,
  "lead" | "purchase"
>

const combineAnd = (predicates: SQL[]): SQL =>
  predicates
    .slice(1)
    .reduce(
      (combined, predicate) => sql`${combined} AND ${predicate}`,
      predicates[0],
    )

/**
 * Single source of truth for "is this contact/row within CTWA segment S in
 * [since, until]" — the exact same predicate set used by the Facebook
 * custom-audience export (`adsConversionEventRepository.listExportSegmentRows`)
 * and the `ctwaRetarget` contact-filter condition, so a WhatsApp retarget
 * broadcast resolves the identical recipients as the Facebook path.
 *
 * `conversations` keys on `ContactInbox.referral->>'ctwaClid'` +
 * `firstInteractionAt` (NOT event `occurredAt`); `leads`/`purchases` key on
 * ONE `AdsConversionEvent` row (`eventType` + `occurredAt` [+ `adId`]).
 *
 * Returns a bare boolean predicate over the relevant table(s) — callers own
 * the FROM/JOIN (a direct WHERE for a query already selecting from those
 * tables, or the body of a correlated `EXISTS` subquery).
 */
export function buildCtwaSegmentPredicate(
  input: CtwaSegmentPredicateInput,
): SQL {
  if (input.segment === "conversations") {
    return buildConversationsPredicate(input)
  }

  const eventType = conversionEventTypeBySegment[input.segment]
  const predicates: SQL[] = [
    eq(adsConversionEventModel.eventType, eventType),
    gte(adsConversionEventModel.occurredAt, input.since),
    lte(adsConversionEventModel.occurredAt, input.until),
  ]
  if (input.adId) {
    predicates.push(eq(adsConversionEventModel.adId, input.adId))
  }
  if (input.workspaceId) {
    predicates.push(eq(adsConversionEventModel.workspaceId, input.workspaceId))
  }
  if (input.channel) {
    predicates.push(eq(adsConversionEventModel.channel, input.channel))
  } else if (input.integrationWhatsappId) {
    // "channel omitted = WhatsApp behavior" must hold for the events branch
    // too: a WhatsApp-scoped legacy caller (integration id, no channel) would
    // otherwise match same-adId events from any channel. Callers that omit
    // BOTH stay unfiltered on purpose — the saved contact-filter contract is
    // "any channel" when no narrowing is chosen (see ctwaRetargetConditionSchema).
    predicates.push(eq(adsConversionEventModel.channel, "whatsapp"))
  }
  if (input.integrationWhatsappId) {
    predicates.push(
      eq(
        adsConversionEventModel.integrationWhatsappId,
        input.integrationWhatsappId,
      ),
    )
  }
  if (input.integrationMessengerId) {
    predicates.push(
      eq(
        adsConversionEventModel.integrationMessengerId,
        input.integrationMessengerId,
      ),
    )
  }
  if (input.integrationInstagramId) {
    predicates.push(
      eq(
        adsConversionEventModel.integrationInstagramId,
        input.integrationInstagramId,
      ),
    )
  }
  return combineAnd(predicates)
}

/**
 * `conversations` segment for `buildCtwaSegmentPredicate`. Explicit
 * `"whatsapp"` (or the legacy channel-omitted + `integrationWhatsappId`
 * caller) keeps the original `ctwaClid`-keyed predicate byte-for-byte;
 * `messenger`/`instagram` use the ad-referral predicate (no `ctwaClid`
 * equivalent exists); both channel and integration omitted means ANY
 * channel — see the `channel` input doc above.
 */
function buildConversationsPredicate(input: CtwaSegmentPredicateInput): SQL {
  // Channel semantics must mirror the leads/purchases branch above so a
  // saved filter/segment counts a consistent population across segments:
  //  - explicit "whatsapp" (or the legacy channel-omitted +
  //    integrationWhatsappId caller): ctwaClid-keyed, byte-for-byte the
  //    pre-generalization predicate;
  //  - explicit "messenger"/"instagram": ad-referral + ContactInbox.channel;
  //  - BOTH channel and integration omitted: ANY channel — the saved
  //    contact-filter contract (ctwaRetargetConditionSchema) — via the shared
  //    ctwaClid-OR-ad-referral predicate, matching the events branch which
  //    applies no channel filter in that case.
  const isWhatsapp =
    input.channel === "whatsapp" ||
    (!input.channel && Boolean(input.integrationWhatsappId))
  const isAnyChannel = !(input.channel || input.integrationWhatsappId)
  const referralPredicate = (): SQL => {
    if (isAnyChannel) {
      return adReferralPredicate()
    }
    if (isWhatsapp) {
      return sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`
    }
    return sql`${contactInboxModel.referral}->>'adId' IS NOT NULL AND ${contactInboxModel.referral}->>'source' = 'ADS'`
  }
  const predicates: SQL[] = [
    referralPredicate(),
    gte(contactInboxModel.firstInteractionAt, input.since),
    lte(contactInboxModel.firstInteractionAt, input.until),
  ]
  if (input.adId) {
    predicates.push(sql`${contactInboxModel.referral}->>'adId' = ${input.adId}`)
  }
  // Channel scoping is REQUIRED (not just an optimization) for
  // messenger/instagram: both channels share the same ad-referral
  // predicate above (`referral.adId` + `source === "ADS"`), and
  // `ContactInbox.channel` is the only column distinguishing an
  // Instagram-via-Messenger inbox from a genuine Messenger one. Without
  // this, a messenger-scoped retarget/segment would also match Instagram
  // conversations (and vice versa) whenever no integration id narrows it
  // further — so this is added independent of `integrationMessengerId`/
  // `integrationInstagramId` below.
  if (input.channel && input.channel !== "whatsapp") {
    predicates.push(sql`${contactInboxModel.channel} = ${input.channel}`)
  }
  // NOTE: no `Contact.workspaceId` predicate here. In the filter EXISTS the
  // subquery must NOT re-join `Contact` (an unaliased self-join would make
  // `ContactInbox.contactId = "Contact"."id"` bind to the inner row and
  // break the outer correlation). Workspace scoping comes from the outer
  // contact query (`buildContactWhere`/`buildContactInboxContactFilterSQL`
  // are workspace-scoped); the export path adds `Contact.workspaceId`
  // itself since it selects from `Contact` directly.
  //
  // Correlated existence checks instead of JOINs so this stays a bare
  // predicate usable by both the export SELECT and the filter EXISTS body.
  // An integration owns exactly one inbox, so each matches
  // `contactInbox.inboxId = integration.inboxId AND id = X`.
  if (isWhatsapp && input.integrationWhatsappId) {
    predicates.push(
      integrationInboxExists(
        integrationInboxModelFactoryByChannel.whatsapp(),
        input.integrationWhatsappId,
        input.workspaceId,
      ),
    )
  } else if (input.channel === "messenger" && input.integrationMessengerId) {
    predicates.push(
      integrationInboxExists(
        integrationInboxModelFactoryByChannel.messenger(),
        input.integrationMessengerId,
        input.workspaceId,
      ),
    )
  } else if (input.channel === "instagram" && input.integrationInstagramId) {
    predicates.push(
      integrationInboxExists(
        integrationInboxModelFactoryByChannel.instagram(),
        input.integrationInstagramId,
        input.workspaceId,
      ),
    )
  }
  return combineAnd(predicates)
}

/**
 * Correlated `EXISTS` body around {@link buildCtwaSegmentPredicate} for the
 * generic contact filter: `SELECT 1 FROM … [JOIN …] WHERE <segment row's
 * contact> = contactIdColumn AND <predicate>`. Callers wrap this in
 * `EXISTS (...)` (see `existsWhere` in `./exists`).
 */
export function buildCtwaSegmentContactExists(
  input: CtwaSegmentPredicateInput,
  contactIdColumn: AnyColumn,
): SQL {
  const predicate = buildCtwaSegmentPredicate(input)

  if (input.segment === "conversations") {
    return sql`SELECT 1 FROM ${contactInboxModel} WHERE ${contactInboxModel.contactId} = ${contactIdColumn} AND ${predicate}`
  }

  return sql`SELECT 1 FROM ${adsConversionEventModel} INNER JOIN ${contactInboxModel} ON ${contactInboxModel.id} = ${adsConversionEventModel.contactInboxId} WHERE ${contactInboxModel.contactId} = ${contactIdColumn} AND ${predicate}`
}

/**
 * Channel-agnostic "did this ContactInbox originate from a paid ad click"
 * predicate for the `fromCtwaAd` boolean filter field. Unlike
 * {@link buildCtwaSegmentPredicate}'s `conversations` branch — which is
 * explicitly channel-scoped and picks ONE of the two predicates below based
 * on `channel` — `fromCtwaAd` has no channel scoping in the UI, so it must
 * match a contact coming from ANY channel's ad-referral convention. ORs both:
 *
 *  - WhatsApp CTWA: `referral.ctwaClid` is set. WhatsApp's raw referral
 *    payload sets `referral.source` from `source_type`, whose values are
 *    `"ad"`/`"post"` — never `"ADS"` — so the second branch below can never
 *    match a WhatsApp row (see `getWhatsappReferral` in
 *    `integrations/whatsapp/src/handlers/message/incomming-message.ts`).
 *  - Messenger/Instagram CTM/CTID: `referral.adId` is set AND
 *    `referral.source === "ADS"` — the verbatim Graph API referral fields
 *    (see `normalizeReferral` in
 *    `integrations/messenger/src/handlers/message/incomming-message.ts` and
 *    the Instagram counterpart). WhatsApp rows never set `source` to
 *    `"ADS"`, so this branch can never double-match a WhatsApp row.
 *
 * ORing (instead of replacing) the original WhatsApp-only predicate keeps
 * every pre-existing WhatsApp `fromCtwaAd` filter result unchanged.
 */
// Deliberately a function (not a module-scope SQL constant): building the
// `sql` tag eagerly at import time crashes test suites that mock
// `@chatbotx.io/database` schema exports narrowly — same reasoning as
// `getConflictTarget` in the ads-conversion-event repository.
export function adReferralPredicate(): SQL {
  return sql`(
  (${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL AND ${contactInboxModel.referral}->>'ctwaClid' <> '')
  OR (${contactInboxModel.referral}->>'adId' IS NOT NULL AND ${contactInboxModel.referral}->>'source' = 'ADS')
)`
}

/**
 * `since`/`until` on the `ctwaRetarget` filter condition are `YYYY-MM-DD`
 * date keys (not timezone-aware); resolve them to UTC day boundaries.
 *
 * DELIBERATELY STILL UTC-ANCHORED (documented seam, not an oversight): the
 * Ads Analytics "Retarget → Send WhatsApp broadcast" deep link
 * (`buildWhatsappRetargetHref`) hands this function the SAME `from`/`to`
 * date keys as the dashboard's own `parseAnalyticsDateRange`, which now
 * anchors to the VIEWER's timezone. This function was not
 * threaded the same way: `ctwaRetargetDateRange` sits behind the generic
 * contact-filter condition dispatcher (`buildWhereFromCondition` in
 * `queries/contact-filter/index.ts`), shared by every filter type across
 * segments, broadcasts, and audiences — not analytics-specific. The
 * `ctwaRetarget` condition is also JSON-serialized into a URL and can be
 * persisted as a saved filter; baking in a snapshot of "the viewer's
 * timezone at link-build time" would silently go stale if evaluated later or
 * by a different viewer, a correctness question the live analytics dashboard
 * doesn't have. Closing this seam requires deciding that question plus
 * touching `ctwaRetargetConditionSchema`
 * (`apps/builder/src/features/contact-filter/schemas/ctwa-retarget-filter.ts`),
 * `buildWhatsappRetargetHref`, and the generic dispatcher — out of scope
 * here; left UTC-anchored, same as before this migration.
 */
export function ctwaRetargetDateRange(
  since: string,
  until: string,
): { since: Date; until: Date } {
  return {
    since: new Date(`${since}T00:00:00.000Z`),
    until: new Date(`${until}T23:59:59.999Z`),
  }
}
