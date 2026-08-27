import type { adsEligibleChannelTypes } from "@chatbotx.io/utils/channel"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  type SQL,
  sql,
} from "../../client"
import type { AdsConversionChannel } from "../../schema"
import {
  contactInboxModel,
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationWhatsappModel,
} from "../../schema"
import type { ContactInboxModel } from "../../types"

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
 * Ad-referral attribution predicate pair (messenger/instagram — no
 * `ctwaClid` equivalent exists): `referral.adId` present + `referral.source
 * === "ADS"`. Kept LOCAL to this file (not shared with the identical pair in
 * `ads-conversion-event/repository.ts`) — see that file's own copy for the
 * circular-import hazard that rules out a shared module.
 */
function adReferralConditions(): SQL[] {
  return [
    sql`${contactInboxModel.referral}->>'adId' IS NOT NULL`,
    sql`${contactInboxModel.referral}->>'source' = 'ADS'`,
  ]
}

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
const adEligibleInboxChannelConfigs = {
  whatsapp: {
    model: () => integrationWhatsappModel,
    channel: "whatsapp",
    referralConditions: () => [
      sql`${contactInboxModel.referral}->>'ctwaClid' IS NOT NULL`,
    ],
  },
  messenger: {
    model: () => integrationMessengerModel,
    channel: "messenger",
    referralConditions: adReferralConditions,
  },
  instagram: {
    model: () => integrationInstagramModel,
    channel: "instagram",
    referralConditions: adReferralConditions,
  },
} satisfies Record<AdEligibleInboxChannel, AdEligibleInboxChannelConfig>

export type ContactInboxWorkspaceRow = Pick<
  ContactInboxModel,
  "id" | "channel" | "inboxId"
>

export const contactInboxRepository = {
  /**
   * Single-row, workspace-scoped load of a contact inbox by id — the cheap
   * "does this contact inbox even exist / what channel is it" lookup that
   * `recordTriggerConversion` (ads-conversion trigger actions) starts with,
   * so a non-eligible-channel contact inbox costs exactly one indexed lookup
   * (primary key join to Inbox for workspace scoping) before returning.
   * `channel` is returned as the raw `text()` column value — callers narrow
   * it with `isAdsEligibleChannel`.
   */
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxWorkspaceRow | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        channel: contactInboxModel.channel,
        inboxId: contactInboxModel.inboxId,
      })
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
      .select({
        id: contactInboxModel.id,
        channel: contactInboxModel.channel,
        inboxId: contactInboxModel.inboxId,
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
   * `dateTimeBasedTrigger`, or a stale/foreign threaded id). Mirrors the
   * ordering of the `db.query.contactInboxModel.findFirst({ orderBy:
   * { lastMessageAt: "desc" } })` call it replaces (NULLS LAST is Postgres's
   * default `desc` behavior, so ties/no-messages-yet inboxes sort last, same
   * as before).
   */
  async findMostRecentByContact(
    input: { contactId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactInboxWorkspaceRow | null> {
    const [row] = await tx
      .select({
        id: contactInboxModel.id,
        channel: contactInboxModel.channel,
        inboxId: contactInboxModel.inboxId,
      })
      .from(contactInboxModel)
      .innerJoin(
        inboxModel,
        and(
          eq(inboxModel.id, contactInboxModel.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
      )
      .where(eq(contactInboxModel.contactId, input.contactId))
      .orderBy(desc(contactInboxModel.lastMessageAt))
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
}
