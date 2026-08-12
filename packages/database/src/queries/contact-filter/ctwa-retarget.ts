import { type AnyColumn, eq, gte, lte, type SQL, sql } from "drizzle-orm"
import {
  adsConversionEventModel,
  contactInboxModel,
  integrationWhatsappModel,
} from "../../schema"

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
    const predicates: SQL[] = [
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
      gte(contactInboxModel.firstInteractionAt, input.since),
      lte(contactInboxModel.firstInteractionAt, input.until),
    ]
    if (input.adId) {
      predicates.push(
        sql`${contactInboxModel.referral}->>'adId' = ${input.adId}`,
      )
    }
    // NOTE: no `Contact.workspaceId` predicate here. In the filter EXISTS the
    // subquery must NOT re-join `Contact` (an unaliased self-join would make
    // `ContactInbox.contactId = "Contact"."id"` bind to the inner row and
    // break the outer correlation). Workspace scoping comes from the outer
    // contact query (`buildContactWhere`/`buildContactInboxContactFilterSQL`
    // are workspace-scoped); the export path adds `Contact.workspaceId`
    // itself since it selects from `Contact` directly.
    if (input.integrationWhatsappId) {
      // Correlated existence check instead of a JOIN so this stays a bare
      // predicate usable by both the export SELECT and the filter EXISTS body.
      // An integration owns exactly one inbox, so this matches the Facebook
      // path's `contactInbox.inboxId = integrationWhatsapp.inboxId AND id = X`.
      const scope = input.workspaceId
        ? sql`${integrationWhatsappModel.id} = ${input.integrationWhatsappId} AND ${integrationWhatsappModel.workspaceId} = ${input.workspaceId} AND ${integrationWhatsappModel.inboxId} = ${contactInboxModel.inboxId}`
        : sql`${integrationWhatsappModel.id} = ${input.integrationWhatsappId} AND ${integrationWhatsappModel.inboxId} = ${contactInboxModel.inboxId}`
      predicates.push(
        sql`EXISTS (SELECT 1 FROM ${integrationWhatsappModel} WHERE ${scope})`,
      )
    }
    return combineAnd(predicates)
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
  if (input.integrationWhatsappId) {
    predicates.push(
      eq(
        adsConversionEventModel.integrationWhatsappId,
        input.integrationWhatsappId,
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
 * `since`/`until` on the `ctwaRetarget` filter condition are `YYYY-MM-DD`
 * date keys (not timezone-aware); resolve them to UTC day boundaries,
 * mirroring `parseAnalyticsDateRange` in the builder's ads analytics schema.
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
