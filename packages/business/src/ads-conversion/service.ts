import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type AdEligibleInboxByContactRow,
  type AdEligibleInboxChannel,
  type AdsConversionRuleUpdateValues,
  adsConversionEventRepository,
  adsConversionRuleRepository,
  contactInboxRepository,
  integrationFacebookAdsRepository,
  integrationInstagramRepository,
  integrationMessengerRepository,
  integrationWhatsappRepository,
} from "@chatbotx.io/database/repositories"
import type {
  AdsConversionCapiStatus,
  AdsConversionChannel,
  AdsConversionEventType,
  adsConversionEventModel,
  adsConversionRuleModel,
} from "@chatbotx.io/database/schema"
import type {
  AdsConversionEventModel,
  AdsConversionRuleModel,
} from "@chatbotx.io/database/types"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { formatUtcDay } from "../lib/date"
import { logger } from "../logger"
import {
  isAdReferralChannel,
  isAdsEligibleChannel,
  perChannelIntegrationIds,
  perChannelIntegrationIdsOrNull,
} from "./channel-fields"
import {
  recordFlowStepConversion as recordFlowStepConversionImpl,
  recordTriggerConversion as recordTriggerConversionImpl,
} from "./record-ads-conversion"
import {
  type AdsConversionRuleTriggerType,
  adsConversionRuleTriggerSchema,
  type CreateAdsConversionRuleInput,
  createAdsConversionRuleInput,
  type EvaluateConversionTriggerInput,
  type EvaluateConversionTriggerOccurrence,
  type EvaluateTemplateSentInput,
  evaluateConversionTriggerInput,
  evaluateTemplateSentInput,
  type GetCtwaFunnelInput,
  getCtwaFunnelInput,
  type IngestAutomaticAdsConversionEventInput,
  ingestAutomaticAdsConversionEventInput,
  type ListAdsConversionExportRowsInput,
  type ListAdsConversionRulesInput,
  type ListAllChannelAdsExportRowsInput,
  type ListRetargetContactsInput,
  listAdsConversionExportRowsInput,
  listAdsConversionRulesInput,
  listAllChannelAdsExportRowsInput,
  listRetargetContactsInput,
  type RecordFlowStepConversionInput,
  type RecordTriggerConversionInput,
  type RemoveAdsConversionRuleInput,
  removeAdsConversionRuleInput,
  type ToggleAdsConversionRuleInput,
  toggleAdsConversionRuleInput,
  type UpdateAdsConversionRuleInput,
  updateAdsConversionRuleInput,
} from "./schema"
import {
  insertConversionEventOrRecover,
  integrationByInboxResolvers,
} from "./shared"

// TTL for the hasEnabledTriggerRule boolean cache (HIGH-2): short enough that
// a newly created/enabled rule is picked up quickly even if the invalidation
// below is ever missed, long enough to absorb the "every inbound WhatsApp
// message" call volume from the contactReplied listener gate.
const HAS_TRIGGER_RULE_CACHE_TTL_SECONDS = 60

// A cached `false` guards an EVENT-PRODUCING path: if the (best-effort) tag
// invalidation is ever missed right after the workspace's first rule is
// created, a stale negative would silently skip real conversions until it
// expires. Keep negatives short-lived so that worst-case window is seconds,
// while positive results keep the longer TTL above.
const HAS_TRIGGER_RULE_NEGATIVE_CACHE_TTL_SECONDS = 10

const hasTriggerRuleTtlFor = (hasRule: boolean): number =>
  hasRule
    ? HAS_TRIGGER_RULE_CACHE_TTL_SECONDS
    : HAS_TRIGGER_RULE_NEGATIVE_CACHE_TTL_SECONDS

// One cache tag per workspace covers every integration/triggerType
// combination for that workspace — simpler and safer than trying to
// enumerate exactly which key(s) a rule mutation could affect (a rule's
// integrationWhatsappId can itself change on update).
const hasTriggerRuleCacheTag = (workspaceId: string): string =>
  `ads-conversion:has-trigger-rule:${workspaceId}`

type RuleIntegrationInput = {
  channel: AdsConversionChannel
  integrationWhatsappId?: string | null
  integrationFacebookAdsId?: string | null
  integrationMessengerId?: string | null
  integrationInstagramId?: string | null
}

type RuleOwnershipInput = RuleIntegrationInput & {
  workspaceId: string
}

type RuleTrigger = ReturnType<typeof parseTrigger>
// Every trigger type in the discriminated union is currently backed by an
// evaluation path (templateSent has its own pipeline; the rest share
// evaluateConversionTrigger). This allowlist stays explicit — rather than
// just trusting the zod union — so a future trigger type added to the schema
// without its evaluation wired up yet fails loudly here instead of silently
// matching nothing.
type SupportedRuleTriggerType = RuleTrigger["type"]
const supportedRuleTriggerTypes = new Set<SupportedRuleTriggerType>([
  "templateSent",
  "tagApplied",
  "keywordMatched",
  "contactReplied",
])

type TriggerHandlerInput = {
  rule: AdsConversionRuleModel
  trigger: RuleTrigger
  templateId?: string
  occurrence?: EvaluateConversionTriggerOccurrence
}

type TriggerHandler = (input: TriggerHandlerInput) => boolean
type TemplateSentAttribution = NonNullable<
  Awaited<
    ReturnType<
      typeof adsConversionEventRepository.findAttributionByContactInbox
    >
  >
>
// Messenger/Instagram counterpart to TemplateSentAttribution: no `wabaId`
// (no per-channel identity column equivalent) and attribution keys on
// ad-referral fields instead of `ctwaClid` — see
// adsConversionEventRepository.findAttributionByAdReferral.
type AdReferralAttribution = NonNullable<
  Awaited<
    ReturnType<typeof adsConversionEventRepository.findAttributionByAdReferral>
  >
>

const channelConsistencyValidators = {
  whatsapp: (input: RuleIntegrationInput) =>
    Boolean(input.integrationWhatsappId) && !input.integrationFacebookAdsId,
  facebook: (input: RuleIntegrationInput) =>
    Boolean(input.integrationFacebookAdsId) && !input.integrationWhatsappId,
  // Live validators for messenger/instagram rule create/update (invoked via
  // assertIntegrationConsistency): exactly the matching channel's FK must be
  // set. Exhaustive over AdsConversionChannel by construction.
  messenger: (input: RuleIntegrationInput) =>
    Boolean(input.integrationMessengerId) &&
    !input.integrationWhatsappId &&
    !input.integrationFacebookAdsId &&
    !input.integrationInstagramId,
  instagram: (input: RuleIntegrationInput) =>
    Boolean(input.integrationInstagramId) &&
    !input.integrationWhatsappId &&
    !input.integrationFacebookAdsId &&
    !input.integrationMessengerId,
} satisfies Record<
  AdsConversionChannel,
  (input: RuleIntegrationInput) => boolean
>

function assertIntegrationConsistency(input: RuleIntegrationInput) {
  if (channelConsistencyValidators[input.channel](input)) {
    return
  }

  throw new ChatbotXException(
    "Ads conversion rule integration must match the selected channel",
  )
}

const channelOwnershipValidators = {
  whatsapp: async (input: RuleOwnershipInput, tx?: DatabaseClient) => {
    if (!input.integrationWhatsappId) {
      return false
    }

    const integration =
      await integrationWhatsappRepository.findByIdForWorkspace(
        {
          id: input.integrationWhatsappId,
          workspaceId: input.workspaceId,
        },
        tx,
      )

    return Boolean(integration)
  },
  facebook: async (input: RuleOwnershipInput, tx?: DatabaseClient) => {
    if (!input.integrationFacebookAdsId) {
      return false
    }

    const integration =
      await integrationFacebookAdsRepository.findWorkspaceIntegration(
        {
          id: input.integrationFacebookAdsId,
          workspaceId: input.workspaceId,
        },
        tx,
      )

    return Boolean(integration)
  },
  // Live ownership checks for messenger/instagram rule create/update: the
  // referenced integration must belong to the workspace.
  messenger: async (input: RuleOwnershipInput, tx?: DatabaseClient) => {
    if (!input.integrationMessengerId) {
      return false
    }

    const integration =
      await integrationMessengerRepository.findWorkspaceIntegration(
        {
          id: input.integrationMessengerId,
          workspaceId: input.workspaceId,
        },
        tx,
      )

    return Boolean(integration)
  },
  instagram: async (input: RuleOwnershipInput, tx?: DatabaseClient) => {
    if (!input.integrationInstagramId) {
      return false
    }

    const integration =
      await integrationInstagramRepository.findWorkspaceIntegration(
        {
          id: input.integrationInstagramId,
          workspaceId: input.workspaceId,
        },
        tx,
      )

    return Boolean(integration)
  },
} satisfies Record<
  AdsConversionChannel,
  (input: RuleOwnershipInput, tx?: DatabaseClient) => Promise<boolean>
>

async function assertIntegrationOwnership(
  input: RuleOwnershipInput,
  tx?: DatabaseClient,
) {
  if (await channelOwnershipValidators[input.channel](input, tx)) {
    return
  }

  throw new ChatbotXException(
    "Ads conversion rule integration was not found in this workspace",
  )
}

function parseTrigger(trigger: unknown) {
  return adsConversionRuleTriggerSchema.parse(trigger)
}

// Channel × trigger-type allowlist (Phase 5 / Amendment A1 server-side
// guard — "never trust the client"): whatsapp/facebook/messenger allow every
// currently-supported trigger type; instagram excludes `templateSent`
// because no template entity/step exists for Instagram in ChatbotX or
// Meta's IG messaging surface (see Amendment A1). Checked in ADDITION to
// `supportedRuleTriggerTypes` above, not instead of it.
const supportedTriggerTypesByChannel: Record<
  AdsConversionChannel,
  ReadonlySet<SupportedRuleTriggerType>
> = {
  whatsapp: supportedRuleTriggerTypes,
  facebook: supportedRuleTriggerTypes,
  messenger: supportedRuleTriggerTypes,
  instagram: new Set(
    [...supportedRuleTriggerTypes].filter((type) => type !== "templateSent"),
  ),
}

function assertSupportedTrigger(
  trigger: RuleTrigger,
  channel: AdsConversionChannel,
): asserts trigger is Extract<RuleTrigger, { type: SupportedRuleTriggerType }> {
  if (
    !supportedRuleTriggerTypes.has(trigger.type as SupportedRuleTriggerType)
  ) {
    throw new ChatbotXException(
      `Ads conversion trigger type "${trigger.type}" is not supported yet`,
    )
  }

  if (
    !supportedTriggerTypesByChannel[channel].has(
      trigger.type as SupportedRuleTriggerType,
    )
  ) {
    throw new ChatbotXException(
      `Ads conversion trigger type "${trigger.type}" is not supported for channel "${channel}"`,
    )
  }
}

const triggerHandlers = {
  templateSent: ({ trigger, templateId }) =>
    trigger.type === "templateSent" &&
    templateId !== undefined &&
    trigger.templateIds.includes(templateId),
  tagApplied: ({ trigger, occurrence }) =>
    trigger.type === "tagApplied" &&
    occurrence?.type === "tagApplied" &&
    trigger.tagIds.includes(occurrence.tagId),
  keywordMatched: ({ trigger, occurrence }) =>
    trigger.type === "keywordMatched" &&
    occurrence?.type === "keywordMatched" &&
    trigger.automatedResponseIds.includes(occurrence.automatedResponseId),
  contactReplied: ({ trigger, occurrence }) =>
    trigger.type === "contactReplied" &&
    occurrence?.type === "contactReplied" &&
    (trigger.firstReplyOnly ? occurrence.isFirstReply : true),
} satisfies Record<RuleTrigger["type"], TriggerHandler>

const whatsappAutomaticEventTypeByName = {
  LeadSubmitted: "lead",
  Purchase: "purchase",
} satisfies Record<
  IngestAutomaticAdsConversionEventInput["payload"]["event_name"],
  AdsConversionEventType
>

function parseUnixTimestamp(timestamp: number | string): Date {
  const seconds =
    typeof timestamp === "number" ? timestamp : Number.parseFloat(timestamp)
  if (!Number.isFinite(seconds)) {
    throw new ChatbotXException("Invalid automatic conversion event timestamp")
  }

  return new Date(seconds * 1000)
}

function mapWhatsappAutomaticEventPayload(
  input: IngestAutomaticAdsConversionEventInput,
): Omit<
  typeof adsConversionEventModel.$inferInsert,
  "id" | "contactInboxId" | "adId"
> {
  return {
    workspaceId: input.workspaceId,
    // Explicit even though the column defaults to "whatsapp" DB-side:
    // insertIgnoreDuplicate's conflict-target selection reads
    // `values.channel` at the JS layer and must never see it omitted.
    channel: "whatsapp",
    integrationWhatsappId: input.integrationWhatsappId,
    wabaId: input.wabaId,
    source: "automatic",
    eventType: whatsappAutomaticEventTypeByName[input.payload.event_name],
    ctwaClid: input.payload.ctwa_clid,
    currency: input.payload.custom_data?.currency ?? null,
    value:
      input.payload.custom_data?.value === undefined
        ? null
        : String(input.payload.custom_data.value),
    occurredAt: parseUnixTimestamp(input.payload.timestamp),
    sourceEventId: input.payload.id,
    capiStatus: "pending",
    capiSentAt: null,
  }
}

async function evaluateTemplateSentRule(input: {
  attribution: TemplateSentAttribution
  ctwaClid: string
  now: Date
  parsed: EvaluateTemplateSentInput
  rule: AdsConversionRuleModel
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const trigger = parseTrigger(input.rule.trigger)
  if (
    !triggerHandlers[trigger.type]({
      rule: input.rule,
      trigger,
      templateId: input.parsed.templateId,
    })
  ) {
    return null
  }

  // Dedupe semantic: one rule-created conversion per contact inbox per UTC
  // day. The database unique key on sourceEventId makes repeated sends or
  // job retries collapse to this deterministic occurrence id. Uses
  // find-or-create + re-enqueue (like every other evaluator) so a queue
  // enqueue that fails after a successful insert can never strand the event
  // at `pending` — the retry recovers it instead of silently dropping the
  // CAPI send.
  const sourceEventId = `rule-${input.rule.id}-inbox-${input.attribution.id}-${formatUtcDay(input.now)}`

  return await insertConversionEventOrRecover(
    {
      workspaceId: input.parsed.workspaceId,
      channel: "whatsapp",
      integrationWhatsappId: input.parsed.integrationId,
      wabaId: input.attribution.wabaId,
      source: "rule",
      eventType: input.rule.eventType,
      ctwaClid: input.ctwaClid,
      adId: input.attribution.referral?.adId ?? null,
      contactInboxId: input.attribution.id,
      currency: null,
      value: null,
      occurredAt: input.now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: input.parsed.workspaceId,
      integrationWhatsappId: input.parsed.integrationId,
      source: "rule",
      sourceEventId,
    },
    input.tx,
  )
}

/**
 * Shared by every conversion-trigger rule evaluation beyond `templateSent`.
 * Unlike evaluateTemplateSentRule, this recovers from an insert that was
 * deduped by the unique `sourceEventId` constraint (find-or-create): if the
 * event already exists and is still `pending`, its send job is re-enqueued
 * (idempotent via the deterministic `ads-conversion-send-${event.id}` jobId)
 * so a prior enqueue failure after a successful insert can never silently
 * drop the CAPI send.
 */
async function evaluateConversionTriggerRule(input: {
  attribution: TemplateSentAttribution
  ctwaClid: string
  now: Date
  parsed: EvaluateConversionTriggerInput
  rule: AdsConversionRuleModel
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const trigger = parseTrigger(input.rule.trigger)
  if (
    !triggerHandlers[trigger.type]({
      rule: input.rule,
      trigger,
      occurrence: input.parsed.occurrence,
    })
  ) {
    return null
  }

  const sourceEventId = `rule-${input.rule.id}-inbox-${input.attribution.id}-${formatUtcDay(input.now)}`

  return await insertConversionEventOrRecover(
    {
      workspaceId: input.parsed.workspaceId,
      channel: "whatsapp",
      integrationWhatsappId: input.parsed.integrationId,
      wabaId: input.attribution.wabaId,
      source: "rule",
      eventType: input.rule.eventType,
      ctwaClid: input.ctwaClid,
      adId: input.attribution.referral?.adId ?? null,
      contactInboxId: input.attribution.id,
      currency: null,
      value: null,
      occurredAt: input.now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: input.parsed.workspaceId,
      integrationWhatsappId: input.parsed.integrationId,
      source: "rule",
      sourceEventId,
    },
    input.tx,
  )
}

/**
 * Messenger/Instagram counterpart to `evaluateConversionTriggerRule`: same
 * find-or-create + re-enqueue dedupe semantics, but the inserted row has no
 * `wabaId`/`ctwaClid` (neither channel has them) and the FK column written
 * is whichever one matches `attribution.channel`.
 */
async function evaluateAdReferralTriggerRule(input: {
  attribution: AdReferralAttribution
  channel: Extract<AdsConversionChannel, "messenger" | "instagram">
  integrationId: string
  now: Date
  workspaceId: string
  occurrence: EvaluateConversionTriggerOccurrence
  rule: AdsConversionRuleModel
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const trigger = parseTrigger(input.rule.trigger)
  if (
    !triggerHandlers[trigger.type]({
      rule: input.rule,
      trigger,
      occurrence: input.occurrence,
    })
  ) {
    return null
  }

  const sourceEventId = `rule-${input.rule.id}-inbox-${input.attribution.id}-${formatUtcDay(input.now)}`

  return await insertConversionEventOrRecover(
    {
      workspaceId: input.workspaceId,
      channel: input.channel,
      ...perChannelIntegrationIdsOrNull(input.channel, input.integrationId),
      source: "rule",
      eventType: input.rule.eventType,
      adId: input.attribution.referral?.adId ?? null,
      contactInboxId: input.attribution.id,
      currency: null,
      value: null,
      occurredAt: input.now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: input.workspaceId,
      channel: input.channel,
      ...perChannelIntegrationIds(input.channel, input.integrationId),
      source: "rule",
      sourceEventId,
    },
    input.tx,
  )
}

/**
 * Messenger counterpart to `evaluateTemplateSentRule` (Amendment A1): no
 * `wabaId`/`ctwaClid`, and — like the WhatsApp path — find-or-create dedupe
 * recovery on insert-deduped rows (shared via `insertConversionEventOrRecover`).
 */
async function evaluateMessengerTemplateSentRule(input: {
  attribution: AdReferralAttribution
  integrationId: string
  now: Date
  workspaceId: string
  templateId: string
  rule: AdsConversionRuleModel
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const trigger = parseTrigger(input.rule.trigger)
  if (
    !triggerHandlers[trigger.type]({
      rule: input.rule,
      trigger,
      templateId: input.templateId,
    })
  ) {
    return null
  }

  const sourceEventId = `rule-${input.rule.id}-inbox-${input.attribution.id}-${formatUtcDay(input.now)}`

  return await insertConversionEventOrRecover(
    {
      workspaceId: input.workspaceId,
      channel: "messenger",
      integrationMessengerId: input.integrationId,
      source: "rule",
      eventType: input.rule.eventType,
      adId: input.attribution.referral?.adId ?? null,
      contactInboxId: input.attribution.id,
      currency: null,
      value: null,
      occurredAt: input.now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: input.workspaceId,
      channel: "messenger",
      integrationMessengerId: input.integrationId,
      source: "rule",
      sourceEventId,
    },
    input.tx,
  )
}

/**
 * WhatsApp branch of `evaluateTemplateSent` (Amendment A1): the `ctwaClid`
 * gate, byte-for-byte the pre-dispatch-map behavior. Free function (not a
 * class method) so it can sit in `templateSentEvaluatorsByChannel` below
 * without needing a `this` binding — mirrors `evaluateMessengerTemplateSent`.
 */
async function evaluateWhatsappTemplateSent(
  parsed: EvaluateTemplateSentInput,
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel[]> {
  // Hot path ordering: first do the single contact-inbox attribution lookup,
  // then skip rule loading unless CTWA is present. Most template sends are
  // not ad-attributed, so this keeps the chat send pipeline's follow-up job
  // cheap in the common case.
  const attribution =
    await adsConversionEventRepository.findAttributionByContactInbox(
      {
        workspaceId: parsed.workspaceId,
        integrationWhatsappId: parsed.integrationId,
        contactInboxId: parsed.contactInboxId,
      },
      tx,
    )
  const ctwaClid = attribution?.referral?.ctwaClid
  if (!(attribution && ctwaClid)) {
    return []
  }

  const rules = await adsConversionRuleRepository.listByWorkspace(
    parsed.workspaceId,
    {
      channel: "whatsapp",
      enabled: true,
      integrationWhatsappId: parsed.integrationId,
    },
    tx,
  )
  if (rules.length === 0) {
    return []
  }

  const now = new Date()
  const inserted: AdsConversionEventModel[] = []
  for (const rule of rules) {
    const event = await evaluateTemplateSentRule({
      attribution,
      ctwaClid,
      now,
      parsed,
      rule,
      tx,
    })
    if (!event) {
      continue
    }

    inserted.push(event)
  }

  return inserted
}

/**
 * Messenger branch of `evaluateTemplateSent` (Amendment A1). Same hot-path
 * ordering as the WhatsApp branch — attribution lookup first, rules only
 * loaded when attributed — but gates on ad-referral attribution instead of
 * `ctwaClid`. Free function — see `evaluateWhatsappTemplateSent` above.
 */
async function evaluateMessengerTemplateSent(
  parsed: EvaluateTemplateSentInput,
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel[]> {
  const attribution =
    await adsConversionEventRepository.findAttributionByAdReferral(
      {
        workspaceId: parsed.workspaceId,
        channel: "messenger",
        integrationMessengerId: parsed.integrationId,
        contactInboxId: parsed.contactInboxId,
      },
      tx,
    )
  if (!attribution) {
    return []
  }

  const rules = await adsConversionRuleRepository.listByWorkspace(
    parsed.workspaceId,
    {
      channel: "messenger",
      enabled: true,
      integrationMessengerId: parsed.integrationId,
    },
    tx,
  )
  if (rules.length === 0) {
    return []
  }

  const now = new Date()
  const inserted: AdsConversionEventModel[] = []
  for (const rule of rules) {
    const event = await evaluateMessengerTemplateSentRule({
      attribution,
      integrationId: parsed.integrationId,
      now,
      workspaceId: parsed.workspaceId,
      templateId: parsed.templateId,
      rule,
      tx,
    })
    if (!event) {
      continue
    }

    inserted.push(event)
  }

  return inserted
}

/**
 * `evaluateTemplateSent` channel dispatch (Amendment A1): WhatsApp keeps the
 * `ctwaClid` gate; Messenger gates on ad-referral attribution instead
 * (`referral.adId` + `source === "ADS"`, no `ctwaClid` equivalent exists).
 * Deliberately a *partial* map — instagram (no template entity/step exists)
 * and facebook (dead channel, no template concept either) fall through to
 * `evaluateTemplateSent`'s "not supported" exception, same as before this
 * was table-driven.
 */
type TemplateSentEvaluator = (
  parsed: EvaluateTemplateSentInput,
  tx?: DatabaseClient,
) => Promise<AdsConversionEventModel[]>

const templateSentEvaluatorsByChannel: Partial<
  Record<AdsConversionChannel, TemplateSentEvaluator>
> = {
  whatsapp: evaluateWhatsappTemplateSent,
  messenger: evaluateMessengerTemplateSent,
}

export type CtwaFunnelAdRow = {
  adId: string | null
  adName?: string | null
  conversations: number
  leads: number
  purchases: number
  revenue: number
  /**
   * Distinct channel(s) this ad drove conversations/leads/purchases on —
   * only populated under "All channels" aggregation (`allChannels: true`).
   * A PASSENGER label, NOT part of row identity: identity stays `adId`
   * (Facebook Insights spend is per-`adId` only, with no channel dimension —
   * splitting identity by channel would double-count spend across the split
   * rows). Almost always a single channel; the rare ad that drove
   * conversions on more than one channel carries all of them here.
   */
  channels?: string[]
}

export type CtwaFunnel = {
  totals: {
    conversations: number
    leads: number
    purchases: number
    revenue: number
  }
  perAd: CtwaFunnelAdRow[]
}

/**
 * Daily funnel rows keep `adId` (not aggregated away) so callers — the
 * builder query layer — can apply the same ad-account survivor filtering as
 * `mergeAdsAnalytics` before summing per day.
 */
export type CtwaFunnelTimeseriesRow = {
  date: string
  adId: string | null
  conversations: number
  leads: number
  purchases: number
}

export type CapiDeliverySummary = {
  sent: number
  pending: number
  failed: number
  skippedNoScope: number
  skippedRegion: number
}

const capiDeliverySummaryKeyByStatus = {
  pending: "pending",
  sent: "sent",
  failed: "failed",
  skipped_no_scope: "skippedNoScope",
  skipped_region: "skippedRegion",
} satisfies Record<AdsConversionCapiStatus, keyof CapiDeliverySummary>

class AdsConversionService extends BaseService {
  list(
    input: ListAdsConversionRulesInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionRuleModel[]> {
    const parsed = listAdsConversionRulesInput.parse(input)
    return adsConversionRuleRepository.listByWorkspace(
      parsed.workspaceId,
      { channel: parsed.channel },
      tx,
    )
  }

  async create(
    input: CreateAdsConversionRuleInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionRuleModel> {
    const parsed = createAdsConversionRuleInput.parse(input)
    const values = this.toInsertValues(parsed)
    assertIntegrationConsistency(values)
    await assertIntegrationOwnership(values, tx)

    const created = await adsConversionRuleRepository.create(values, tx)
    await this.invalidateHasTriggerRuleCache(parsed.workspaceId)
    return created
  }

  async update(
    input: UpdateAdsConversionRuleInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionRuleModel> {
    const parsed = updateAdsConversionRuleInput.parse(input)
    const existing = await adsConversionRuleRepository.findWorkspaceRule(
      { id: parsed.id, workspaceId: parsed.workspaceId },
      tx,
    )
    if (!existing) {
      throw new ChatbotXException("Ads conversion rule not found")
    }

    const merged = {
      channel: parsed.channel ?? existing.channel,
      integrationWhatsappId:
        parsed.integrationWhatsappId === undefined
          ? existing.integrationWhatsappId
          : parsed.integrationWhatsappId,
      integrationFacebookAdsId:
        parsed.integrationFacebookAdsId === undefined
          ? existing.integrationFacebookAdsId
          : parsed.integrationFacebookAdsId,
      // Phase 2 generalization: these two were missing from `merged` before
      // messenger/instagram existed, which would have made
      // channelConsistencyValidators.messenger/instagram always fail on
      // update (they check these fields but `merged` never carried them).
      integrationMessengerId:
        parsed.integrationMessengerId === undefined
          ? existing.integrationMessengerId
          : parsed.integrationMessengerId,
      integrationInstagramId:
        parsed.integrationInstagramId === undefined
          ? existing.integrationInstagramId
          : parsed.integrationInstagramId,
    }
    assertIntegrationConsistency(merged)
    await assertIntegrationOwnership(
      { ...merged, workspaceId: parsed.workspaceId },
      tx,
    )

    const updated = await adsConversionRuleRepository.update(
      {
        id: parsed.id,
        workspaceId: parsed.workspaceId,
        values: this.toUpdateValues(parsed, merged.channel),
      },
      tx,
    )
    if (!updated) {
      throw new ChatbotXException("Ads conversion rule not found")
    }

    await this.invalidateHasTriggerRuleCache(parsed.workspaceId)
    return updated
  }

  async toggleEnabled(
    input: ToggleAdsConversionRuleInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionRuleModel> {
    const parsed = toggleAdsConversionRuleInput.parse(input)
    const updated = await adsConversionRuleRepository.update(
      {
        id: parsed.id,
        workspaceId: parsed.workspaceId,
        values: { enabled: parsed.enabled },
      },
      tx,
    )
    if (!updated) {
      throw new ChatbotXException("Ads conversion rule not found")
    }

    await this.invalidateHasTriggerRuleCache(parsed.workspaceId)
    return updated
  }

  async remove(
    input: RemoveAdsConversionRuleInput,
    tx?: DatabaseClient,
  ): Promise<void> {
    const parsed = removeAdsConversionRuleInput.parse(input)
    const deleted = await adsConversionRuleRepository.delete(parsed, tx)
    if (!deleted) {
      throw new ChatbotXException("Ads conversion rule not found")
    }

    await this.invalidateHasTriggerRuleCache(parsed.workspaceId)
  }

  /**
   * Cheap cached gate (HIGH-2) for high-volume hook points — the
   * `contactReplied` listener in particular runs on EVERY inbound WhatsApp
   * message platform-wide — so they can skip enqueueing a conversion-trigger
   * evaluation job entirely when the workspace/integration has no enabled
   * rule of that trigger type. Invalidated on rule create/update/toggle/
   * delete (see invalidateHasTriggerRuleCache) so a newly created rule takes
   * effect immediately rather than waiting out the TTL.
   */
  hasEnabledTriggerRule(input: {
    workspaceId: string
    channel: AdsConversionChannel
    integrationId: string
    triggerType: AdsConversionRuleTriggerType
  }): Promise<boolean> {
    const key = `ads-conversion:has-trigger-rule:${input.workspaceId}:${input.channel}:${input.integrationId}:${input.triggerType}`

    return withCache(
      key,
      async () => {
        const rules = await adsConversionRuleRepository.listByWorkspace(
          input.workspaceId,
          {
            channel: input.channel,
            enabled: true,
            ...perChannelIntegrationIds(input.channel, input.integrationId),
          },
        )

        return rules.some(
          (rule) => parseTrigger(rule.trigger).type === input.triggerType,
        )
      },
      {
        ttl: HAS_TRIGGER_RULE_CACHE_TTL_SECONDS,
        ttlFor: hasTriggerRuleTtlFor,
        tags: [hasTriggerRuleCacheTag(input.workspaceId)],
      },
    )
  }

  /**
   * Workspace-level sibling of `hasEnabledTriggerRule` for hook points that
   * fire BEFORE any channel/integration is resolved — the `tagApplied`
   * fan-out attaches to a *contact*, so the channel is only known after
   * `listAdEligibleInboxesByContacts` runs. This lets the common zero-rules
   * workspace skip that 3-channel inbox resolution (and the BullMQ enqueue)
   * entirely. Shares `hasTriggerRuleCacheTag`, so every rule mutation drops
   * it alongside the per-integration keys.
   */
  hasAnyEnabledTriggerRule(input: {
    workspaceId: string
    triggerType: AdsConversionRuleTriggerType
  }): Promise<boolean> {
    const key = `ads-conversion:has-any-trigger-rule:${input.workspaceId}:${input.triggerType}`

    return withCache(
      key,
      async () => {
        const rules = await adsConversionRuleRepository.listByWorkspace(
          input.workspaceId,
          { enabled: true },
        )

        return rules.some(
          (rule) => parseTrigger(rule.trigger).type === input.triggerType,
        )
      },
      {
        ttl: HAS_TRIGGER_RULE_CACHE_TTL_SECONDS,
        ttlFor: hasTriggerRuleTtlFor,
        tags: [hasTriggerRuleCacheTag(input.workspaceId)],
      },
    )
  }

  /**
   * A rule's `integrationWhatsappId` can itself change on update, so rather
   * than trying to invalidate the exact `${workspaceId}:${integrationId}:
   * ${triggerType}` key(s) affected, this drops every hasEnabledTriggerRule
   * entry cached for the workspace — simple and always correct, at the cost
   * of a few extra cache misses right after a rule mutation.
   */
  private async invalidateHasTriggerRuleCache(
    workspaceId: string,
  ): Promise<void> {
    // Best-effort: a Redis failure here must not fail the rule mutation that
    // already committed to the DB. The short TTL bounds any resulting
    // staleness even if this invalidation is dropped.
    try {
      await invalidateCacheByTags([hasTriggerRuleCacheTag(workspaceId)])
    } catch (err) {
      logger.warn(
        { err, workspaceId },
        "Failed to invalidate hasEnabledTriggerRule cache; rule mutation still applied",
      )
    }
  }

  /**
   * Runs a conversion-trigger enqueue side-effect so that NEITHER the queue
   * add NOR the repository lookups it depends on can ever throw into the
   * caller's primary operation (attaching a tag, replying to a keyword). Every
   * public `enqueue*` helper routes through this so a transient DB/Redis blip
   * degrades the (best-effort) conversion attribution instead of breaking the
   * user-facing action.
   */
  private async safeEnqueue(
    operation: string,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run()
    } catch (err) {
      logger.warn(
        { err, operation },
        "Ads conversion trigger enqueue failed; primary operation unaffected",
      )
    }
  }

  /**
   * Cheap pre-filter (MEDIUM-b): single source of truth for "does this
   * channel currently have CTWA attribution", so call sites across worker/
   * automated-response packages don't each hardcode `channel === "whatsapp"`.
   * Kept as an in-memory check (no DB lookup) — the whole point is to let
   * high-volume, mostly-non-whatsapp call sites skip further work cheaply.
   * Delegates to `isAdsEligibleChannel` — see `./channel-fields` for the
   * single source of truth this (and every other ads-eligible-channel check
   * in the codebase) is now built on.
   */
  isEligibleChannel(
    channel: string | null | undefined,
  ): channel is AdsConversionChannel {
    return isAdsEligibleChannel(channel)
  }

  /**
   * Backs the Trigger automation actions `trackAdsLead`/`trackAdsPurchase`
   * (apps/worker/src/trigger/services/action-executor.ts). Implementation
   * lives in `./record-ads-conversion` (colocated module, not inlined here)
   * to keep this already-oversized file's growth minimal — see that
   * module's doc comment for the full find-or-create + re-enqueue semantics
   * it mirrors from `evaluateConversionTriggerRule`, and for how it shares
   * its origin-aware core with `recordFlowStepConversion` below.
   */
  recordTriggerConversion(
    input: RecordTriggerConversionInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel | null> {
    return recordTriggerConversionImpl(input, tx)
  }

  /**
   * Backs the Flow steps `trackAdsLead`/`trackAdsPurchase`
   * (`packages/flow-config/src/steps/track-ads-{lead,purchase}.ts`,
   * dispatched from
   * `apps/worker/src/integration/handlers/meta-conversions/track-ads-step-handler.ts`).
   * Same attribution gate / find-or-create / CAPI-enqueue semantics as
   * `recordTriggerConversion` — the two share a private origin-aware core in
   * `./record-ads-conversion` that only differs in the dedup-key namespace
   * (`trigger-...` vs `flowstep-...`), so a Flow step recording the same
   * eventType for the same contact/day as a Trigger action produces a
   * separate event rather than deduping against it.
   */
  recordFlowStepConversion(
    input: RecordFlowStepConversionInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel | null> {
    return recordFlowStepConversionImpl(input, tx)
  }

  /**
   * WhatsApp-only, deliberately (Phase 2 generalization scope decision): the
   * "automatic" Conversions-API-forwarded event pipeline
   * (`LeadSubmitted`/`Purchase` webhooks WhatsApp sends us) has no
   * Messenger/Instagram equivalent — Meta does not emit an automatic-event
   * webhook for CTM/CTID, so those channels only ever produce `source:
   * "rule"` events via `evaluateConversionTrigger`/`evaluateTemplateSent`.
   */
  async ingestAutomaticEvent(
    input: IngestAutomaticAdsConversionEventInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel | null> {
    const parsed = ingestAutomaticAdsConversionEventInput.parse(input)
    const mapped = mapWhatsappAutomaticEventPayload(parsed)
    const attribution =
      await adsConversionEventRepository.findAttributionByCtwaClid(
        {
          workspaceId: parsed.workspaceId,
          integrationWhatsappId: parsed.integrationWhatsappId,
          ctwaClid: parsed.payload.ctwa_clid,
        },
        tx,
      )

    return adsConversionEventRepository.insertIgnoreDuplicate(
      {
        ...mapped,
        contactInboxId: attribution?.id ?? null,
        adId: attribution?.referral?.adId ?? null,
      },
      tx,
    )
  }

  /**
   * `channel` dispatch (Amendment A1) via `templateSentEvaluatorsByChannel`:
   * WhatsApp keeps the `ctwaClid` gate byte-for-byte; Messenger gates on
   * ad-referral attribution instead (`referral.adId` + `source === "ADS"`,
   * no `ctwaClid` equivalent exists). Instagram/facebook have no
   * `templateSent` support — see `assertSupportedTrigger`'s channel×trigger
   * allowlist for the same rule enforced server-side at rule-creation time;
   * this is the runtime-input counterpart guarding the job-payload entry
   * point.
   */
  async evaluateTemplateSent(
    input: EvaluateTemplateSentInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel[]> {
    const parsed = evaluateTemplateSentInput.parse(input)

    const evaluate = templateSentEvaluatorsByChannel[parsed.channel]
    if (!evaluate) {
      // instagram: no template entity/step exists (Amendment A1).
      // facebook: dead channel, no template concept either.
      throw new ChatbotXException(
        `Ads conversion templateSent trigger is not supported for channel "${parsed.channel}"`,
      )
    }

    // `await` (not a bare `return evaluate(...)`) is load-bearing: this
    // function must stay `async` so the throw above becomes a rejected
    // promise (matching the pre-dispatch-map behavior every caller/test
    // relies on via `.rejects.toThrow(...)`), and `useAwait` requires an
    // await expression once it does.
    return await evaluate(parsed, tx)
  }

  /**
   * Generic evaluator for every conversion trigger type beyond
   * `templateSent` (tagApplied, keywordMatched, contactReplied). Mirrors
   * `evaluateTemplateSent`'s channel dispatch: WhatsApp keeps the `ctwaClid`
   * gate unchanged; messenger/instagram gate on ad-referral attribution via
   * `findAttributionByAdReferral`, rules listed by `channel: parsed.channel`.
   */
  async evaluateConversionTrigger(
    input: EvaluateConversionTriggerInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel[]> {
    const parsed = evaluateConversionTriggerInput.parse(input)

    if (isAdReferralChannel(parsed.channel)) {
      return this.evaluateAdReferralConversionTrigger(parsed, tx)
    }

    if (parsed.channel !== "whatsapp") {
      // "facebook" is a dead channel value — no AdsConversionEvent rows are
      // ever created for it (see the schema CHECK constraint).
      return []
    }

    const attribution =
      await adsConversionEventRepository.findAttributionByContactInbox(
        {
          workspaceId: parsed.workspaceId,
          integrationWhatsappId: parsed.integrationId,
          contactInboxId: parsed.contactInboxId,
        },
        tx,
      )
    const ctwaClid = attribution?.referral?.ctwaClid
    if (!(attribution && ctwaClid)) {
      return []
    }

    const rules = await adsConversionRuleRepository.listByWorkspace(
      parsed.workspaceId,
      {
        channel: "whatsapp",
        enabled: true,
        integrationWhatsappId: parsed.integrationId,
      },
      tx,
    )
    if (rules.length === 0) {
      return []
    }

    const now = new Date()
    const events: AdsConversionEventModel[] = []
    for (const rule of rules) {
      const event = await evaluateConversionTriggerRule({
        attribution,
        ctwaClid,
        now,
        parsed,
        rule,
        tx,
      })
      if (!event) {
        continue
      }

      events.push(event)
    }

    return events
  }

  /** Messenger/Instagram branch of `evaluateConversionTrigger`. */
  private async evaluateAdReferralConversionTrigger(
    parsed: EvaluateConversionTriggerInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel[]> {
    const { channel } = parsed
    if (!isAdReferralChannel(channel)) {
      return []
    }

    const attribution =
      await adsConversionEventRepository.findAttributionByAdReferral(
        {
          workspaceId: parsed.workspaceId,
          channel,
          ...perChannelIntegrationIds(channel, parsed.integrationId),
          contactInboxId: parsed.contactInboxId,
        },
        tx,
      )
    if (!attribution) {
      return []
    }

    const rules = await adsConversionRuleRepository.listByWorkspace(
      parsed.workspaceId,
      {
        channel,
        enabled: true,
        ...perChannelIntegrationIds(channel, parsed.integrationId),
      },
      tx,
    )
    if (rules.length === 0) {
      return []
    }

    const now = new Date()
    const events: AdsConversionEventModel[] = []
    for (const rule of rules) {
      const event = await evaluateAdReferralTriggerRule({
        attribution,
        channel,
        integrationId: parsed.integrationId,
        now,
        workspaceId: parsed.workspaceId,
        occurrence: parsed.occurrence,
        rule,
        tx,
      })
      if (!event) {
        continue
      }

      events.push(event)
    }

    return events
  }

  /**
   * `tagApplied` hook points only have a contact (not a specific
   * conversation) in scope, so this fans out to every WhatsApp-CTWA
   * contact-inbox the contact has and enqueues one evaluation job per inbox.
   * Shared by all four call sites (flow step, the two builder actions that
   * insert `ContactsToTags` directly, tagService, and trigger automation) so
   * none of them duplicate the resolve+enqueue logic.
   *
   * Delegates to `enqueueTagAppliedEvaluationsBulk` with a single-pair input
   * — single-pair callers keep this name, bulk callers use the plural
   * directly, neither duplicates the resolve+enqueue logic (HIGH-1).
   */
  async enqueueTagAppliedEvaluations(input: {
    workspaceId: string
    contactId: string
    tagId: string
  }): Promise<void> {
    await this.enqueueTagAppliedEvaluationsBulk({
      workspaceId: input.workspaceId,
      pairs: [{ contactId: input.contactId, tagId: input.tagId }],
    })
  }

  /**
   * Batch sibling of `enqueueTagAppliedEvaluations` (HIGH-1): resolves every
   * (contactId, tagId) pair's ad-eligible inboxes — across all 3 ads-eligible
   * channels (Phase 3) — in ONE repository query (grouped by contactId),
   * instead of one query per pair — the fix for the N+1 that
   * `bulkAttachToContacts`/`attachToContact`/the builder bulk contact-tag
   * actions used to produce when looping `await
   * enqueueTagAppliedEvaluations(...)` per pair.
   */
  async enqueueTagAppliedEvaluationsBulk(input: {
    workspaceId: string
    pairs: Array<{ contactId: string; tagId: string }>
  }): Promise<void> {
    if (input.pairs.length === 0) {
      return
    }

    await this.safeEnqueue("tagApplied.bulk", async () => {
      // Cheap zero-rules short-circuit (fail-open: a cache/DB hiccup must
      // never drop a real conversion, so an error here means "assume rules
      // exist" and proceed to the fan-out).
      const hasTagAppliedRule = await this.hasAnyEnabledTriggerRule({
        workspaceId: input.workspaceId,
        triggerType: "tagApplied",
      }).catch(() => true)
      if (!hasTagAppliedRule) {
        return
      }

      const contactIds = [...new Set(input.pairs.map((pair) => pair.contactId))]
      const inboxes =
        await contactInboxRepository.listAdEligibleInboxesByContacts({
          workspaceId: input.workspaceId,
          contactIds,
        })

      const inboxesByContactId = new Map<
        string,
        AdEligibleInboxByContactRow[]
      >()
      for (const inbox of inboxes) {
        const existing = inboxesByContactId.get(inbox.contactId)
        if (existing) {
          existing.push(inbox)
        } else {
          inboxesByContactId.set(inbox.contactId, [inbox])
        }
      }

      const now = new Date()
      await Promise.all(
        input.pairs.flatMap((pair) =>
          (inboxesByContactId.get(pair.contactId) ?? []).map((inbox) =>
            this.enqueueConversionTriggerJob({
              workspaceId: input.workspaceId,
              channel: inbox.channel,
              integrationId: inbox.integrationId,
              contactInboxId: inbox.contactInboxId,
              occurrence: { type: "tagApplied", tagId: pair.tagId },
              jobId: `ads-conversion-evaluate-tag-${inbox.contactInboxId}-${pair.tagId}-${formatUtcDay(now)}`,
            }),
          ),
        ),
      )
    })
  }

  /**
   * Precise counterpart to `enqueueTagAppliedEvaluations` for the flow-step
   * `addContactTag` hook point: it already runs inside a specific active
   * conversation (`contactInbox` from `ExecuteStepProps`), so this resolves
   * and enqueues for that one contactInbox instead of fanning out to every
   * other ad-eligible inbox the contact happens to have. Accepts many tag
   * ids so a step attaching several tags resolves the integration ONCE
   * rather than once per tag. `channel` (Phase 3) comes from the caller's
   * already-known `contactInbox.channel` — see `integrationByInboxResolvers`.
   */
  async enqueueTagAppliedEvaluationsForInbox(input: {
    workspaceId: string
    channel: AdsConversionChannel
    inboxId: string
    contactInboxId: string
    tagIds: string[]
  }): Promise<void> {
    if (input.tagIds.length === 0) {
      return
    }

    await this.safeEnqueue("tagApplied.forInbox", async () => {
      // Same zero-rules short-circuit as the bulk path (fail-open) — skips
      // the integration resolution + BullMQ enqueue for the common
      // no-rules workspace.
      const hasTagAppliedRule = await this.hasAnyEnabledTriggerRule({
        workspaceId: input.workspaceId,
        triggerType: "tagApplied",
      }).catch(() => true)
      if (!hasTagAppliedRule) {
        return
      }

      const resolve =
        integrationByInboxResolvers[input.channel as AdEligibleInboxChannel]
      const integration = resolve
        ? await resolve({
            workspaceId: input.workspaceId,
            inboxId: input.inboxId,
          })
        : null
      if (!integration) {
        return
      }

      const now = new Date()
      await Promise.all(
        input.tagIds.map((tagId) =>
          this.enqueueConversionTriggerJob({
            workspaceId: input.workspaceId,
            channel: input.channel,
            integrationId: integration.id,
            contactInboxId: input.contactInboxId,
            occurrence: { type: "tagApplied", tagId },
            jobId: `ads-conversion-evaluate-tag-${input.contactInboxId}-${tagId}-${formatUtcDay(now)}`,
          }),
        ),
      )
    })
  }

  /** Single-tag convenience wrapper over `enqueueTagAppliedEvaluationsForInbox`. */
  async enqueueTagAppliedEvaluationForInbox(input: {
    workspaceId: string
    channel: AdsConversionChannel
    inboxId: string
    contactInboxId: string
    tagId: string
  }): Promise<void> {
    await this.enqueueTagAppliedEvaluationsForInbox({
      workspaceId: input.workspaceId,
      channel: input.channel,
      inboxId: input.inboxId,
      contactInboxId: input.contactInboxId,
      tagIds: [input.tagId],
    })
  }

  /**
   * `keywordMatched` hook point (dispatch-reply.ts) already has the specific
   * contactInbox/inboxId (and therefore its `channel`) in scope from the
   * conversation it matched on, so this only has to resolve the integration
   * id before enqueueing — no contact-wide fan-out needed. `channel` (Phase
   * 3) generalizes this beyond WhatsApp — see `integrationByInboxResolvers`.
   */
  async enqueueKeywordMatchedEvaluation(input: {
    workspaceId: string
    channel: AdsConversionChannel
    inboxId: string
    contactInboxId: string
    automatedResponseId: string
    messageId: string
  }): Promise<void> {
    await this.safeEnqueue("keywordMatched", async () => {
      const resolve =
        integrationByInboxResolvers[input.channel as AdEligibleInboxChannel]
      const integration = resolve
        ? await resolve({
            workspaceId: input.workspaceId,
            inboxId: input.inboxId,
          })
        : null
      if (!integration) {
        return
      }

      await this.enqueueConversionTriggerJob({
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationId: integration.id,
        contactInboxId: input.contactInboxId,
        occurrence: {
          type: "keywordMatched",
          automatedResponseId: input.automatedResponseId,
        },
        jobId: `ads-conversion-evaluate-keyword-${input.messageId}`,
      })
    })
  }

  /**
   * `contactReplied` hook point is the batch `message:received` listener,
   * which already resolves+caches the integration id per inbox across the
   * whole batch (see apps/worker/src/events/message/listener.ts) to avoid
   * one repository round trip per payload — so unlike the keyword helper
   * above, this takes it as a given rather than re-resolving it.
   * `channel`/`integrationId` generalize the previous WhatsApp-only
   * `integrationWhatsappId` param (Phase 2 generalization).
   */
  async enqueueContactRepliedEvaluation(input: {
    workspaceId: string
    channel: AdsConversionChannel
    integrationId: string
    contactInboxId: string
    isFirstReply: boolean
    messageId: string
  }): Promise<void> {
    await this.enqueueConversionTriggerJob({
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationId: input.integrationId,
      contactInboxId: input.contactInboxId,
      occurrence: {
        type: "contactReplied",
        isFirstReply: input.isFirstReply,
      },
      jobId: `ads-conversion-evaluate-reply-${input.messageId}`,
    })
  }

  /**
   * Fire-and-forget: a Redis enqueue failure here must never fail the
   * caller's primary operation (attaching a tag, replying to a keyword,
   * saving an inbound message), so it's logged and swallowed — same pattern
   * as `enqueueTemplateSentEvaluation` in the chat worker. `channel`/
   * `integrationId` generalize the previous WhatsApp-only
   * `integrationWhatsappId` field (Phase 2 generalization).
   */
  private async enqueueConversionTriggerJob(input: {
    workspaceId: string
    channel: AdsConversionChannel
    integrationId: string
    contactInboxId: string
    occurrence: EvaluateConversionTriggerOccurrence
    jobId: string
  }): Promise<void> {
    try {
      await enqueueIntegrationJob(
        {
          type: IntegrationJobAction.evaluateConversionTrigger,
          data: {
            workspaceId: input.workspaceId,
            channel: input.channel,
            integrationId: input.integrationId,
            contactInboxId: input.contactInboxId,
            occurrence: input.occurrence,
          },
        },
        { jobId: input.jobId },
      )
    } catch (err) {
      logger.warn(
        {
          err,
          workspaceId: input.workspaceId,
          channel: input.channel,
          integrationId: input.integrationId,
          contactInboxId: input.contactInboxId,
          occurrence: input.occurrence,
        },
        "Failed to enqueue ads conversion trigger evaluation",
      )
    }
  }

  /**
   * "conversations" channel dispatch shared by `getCtwaFunnel` and
   * `getCtwaFunnelTimeseries`: `allChannels` (checked FIRST — resolved
   * before any per-channel branch, same containment as the builder page's
   * `channel === "all"` handling) switches to the OR-predicate aggregation;
   * otherwise whatsapp (channel omitted or `"whatsapp"`) keeps the
   * `ctwaClid`-based repository calls unchanged, and messenger/instagram
   * switch to the ad-referral-based siblings (Phase 2).
   */
  private countConversationsByAd(
    parsed: ReturnType<typeof getCtwaFunnelInput.parse>,
    tx?: DatabaseClient,
  ) {
    if (parsed.allChannels) {
      return adsConversionEventRepository.countAllChannelConversationsByAd(
        {
          workspaceId: parsed.workspaceId,
          since: parsed.since,
          until: parsed.until,
        },
        tx,
      )
    }

    if (isAdReferralChannel(parsed.channel)) {
      return adsConversionEventRepository.countAdConversationsByAd(
        {
          workspaceId: parsed.workspaceId,
          since: parsed.since,
          until: parsed.until,
          channel: parsed.channel,
          integrationMessengerId: parsed.integrationMessengerId,
          integrationInstagramId: parsed.integrationInstagramId,
        },
        tx,
      )
    }

    return adsConversionEventRepository.countCtwaConversationsByAd(parsed, tx)
  }

  /** Day-bucketed sibling of `countConversationsByAd` — see its doc comment. */
  private countConversationsByDayAndAd(
    parsed: ReturnType<typeof getCtwaFunnelInput.parse>,
    tx?: DatabaseClient,
  ) {
    if (parsed.allChannels) {
      return adsConversionEventRepository.countAllChannelConversationsByDayAndAd(
        {
          workspaceId: parsed.workspaceId,
          since: parsed.since,
          until: parsed.until,
          timezone: parsed.timezone,
        },
        tx,
      )
    }

    if (isAdReferralChannel(parsed.channel)) {
      return adsConversionEventRepository.countAdConversationsByDayAndAd(
        {
          workspaceId: parsed.workspaceId,
          since: parsed.since,
          until: parsed.until,
          channel: parsed.channel,
          integrationMessengerId: parsed.integrationMessengerId,
          integrationInstagramId: parsed.integrationInstagramId,
          timezone: parsed.timezone,
        },
        tx,
      )
    }

    return adsConversionEventRepository.countCtwaConversationsByDayAndAd(
      parsed,
      tx,
    )
  }

  async getCtwaFunnel(
    input: GetCtwaFunnelInput,
    tx?: DatabaseClient,
  ): Promise<CtwaFunnel> {
    const parsed = getCtwaFunnelInput.parse(input)

    // Date semantics: conversations use ContactInbox.firstInteractionAt, while
    // leads/purchases use AdsConversionEvent.occurredAt. Both are compared with
    // the same closed [since, until] UTC range supplied by the caller.
    // `countConversionEventsByAd` (leads/purchases) is already channel-agnostic
    // (Phase 2 widening); "conversations" needs the channel-appropriate
    // predicate — ctwaClid for whatsapp (omitted defaults here too), ad-referral
    // for messenger/instagram.
    const [conversationRows, eventRows] = await Promise.all([
      this.countConversationsByAd(parsed, tx),
      adsConversionEventRepository.countConversionEventsByAd(parsed, tx),
    ])

    const perAd = new Map<string, CtwaFunnelAdRow>()
    const getRow = (adId: string | null): CtwaFunnelAdRow => {
      const key = adId ?? "__unattributed__"
      const existing = perAd.get(key)
      if (existing) {
        return existing
      }
      const row: CtwaFunnelAdRow = {
        adId,
        adName: null,
        conversations: 0,
        leads: 0,
        purchases: 0,
        revenue: 0,
        channels: parsed.allChannels ? [] : undefined,
      }
      perAd.set(key, row)
      return row
    }

    // Under `allChannels`, the repo groups by `(adId[, day], channel)` — so
    // the SAME adId can legitimately arrive as more than one row here (one
    // per channel it drove conversions/leads/purchases on). Accumulate
    // (`+=`) rather than assign (`=`) so those groups sum into ONE funnel
    // row instead of the later group silently overwriting the earlier one;
    // every non-"all" caller still produces at most one row per adId per
    // field, so `+=` starting from 0 is behaviorally identical to the prior
    // `=` for them (see the spend-double-count guard test).
    const addChannel = (row: CtwaFunnelAdRow, channel: string | undefined) => {
      if (!(channel && row.channels) || row.channels.includes(channel)) {
        return
      }
      row.channels.push(channel)
    }

    for (const row of conversationRows) {
      const funnelRow = getRow(row.adId)
      funnelRow.conversations += row.conversations
      // `countConversationsByAd` dispatches to one of three repo methods
      // with different row shapes — only the all-channel one carries
      // `channel`; the cast reads it when present, `undefined` otherwise
      // (true at runtime for the other two shapes, which never have the
      // field at all).
      addChannel(funnelRow, (row as { channel?: string }).channel)
    }

    for (const row of eventRows) {
      const funnelRow = getRow(row.adId)
      addChannel(funnelRow, row.channel)
      if (row.eventType === "lead") {
        funnelRow.leads += row.count
      } else {
        funnelRow.purchases += row.count
        const revenue = Number(row.purchaseValue ?? 0)
        funnelRow.revenue += Number.isFinite(revenue) ? revenue : 0
      }
    }

    const rows = [...perAd.values()]
    return {
      totals: {
        conversations: rows.reduce((sum, row) => sum + row.conversations, 0),
        leads: rows.reduce((sum, row) => sum + row.leads, 0),
        purchases: rows.reduce((sum, row) => sum + row.purchases, 0),
        revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      },
      perAd: rows,
    }
  }

  async getCtwaFunnelTimeseries(
    input: GetCtwaFunnelInput,
    tx?: DatabaseClient,
  ): Promise<CtwaFunnelTimeseriesRow[]> {
    const parsed = getCtwaFunnelInput.parse(input)

    // Same date semantics as getCtwaFunnel, grouped additionally by day.
    const [conversationRows, eventRows] = await Promise.all([
      this.countConversationsByDayAndAd(parsed, tx),
      adsConversionEventRepository.countConversionEventsByDayAndAd(parsed, tx),
    ])

    const perDayAd = new Map<string, CtwaFunnelTimeseriesRow>()
    const getRow = (date: string, adId: string | null) => {
      const key = `${date}:${adId ?? "__unattributed__"}`
      const existing = perDayAd.get(key)
      if (existing) {
        return existing
      }
      const row: CtwaFunnelTimeseriesRow = {
        date,
        adId,
        conversations: 0,
        leads: 0,
        purchases: 0,
      }
      perDayAd.set(key, row)
      return row
    }

    // Same accumulate-not-assign reasoning as getCtwaFunnel: under
    // `allChannels` the repo groups by `(date, adId, channel)`, so the same
    // (date, adId) key can arrive as more than one row.
    for (const row of conversationRows) {
      getRow(row.date, row.adId).conversations += row.conversations
    }

    for (const row of eventRows) {
      const funnelRow = getRow(row.date, row.adId)
      if (row.eventType === "lead") {
        funnelRow.leads += row.count
      } else {
        funnelRow.purchases += row.count
      }
    }

    return [...perDayAd.values()]
  }

  async getCapiDeliverySummary(
    input: GetCtwaFunnelInput,
    tx?: DatabaseClient,
  ): Promise<CapiDeliverySummary> {
    const parsed = getCtwaFunnelInput.parse(input)
    const rows = await adsConversionEventRepository.countByCapiStatus(
      parsed,
      tx,
    )
    const summary: CapiDeliverySummary = {
      sent: 0,
      pending: 0,
      failed: 0,
      skippedNoScope: 0,
      skippedRegion: 0,
    }

    for (const row of rows) {
      summary[capiDeliverySummaryKeyByStatus[row.capiStatus]] = row.count
    }

    return summary
  }

  listExportRows(input: ListAdsConversionExportRowsInput, tx?: DatabaseClient) {
    const parsed = listAdsConversionExportRowsInput.parse(input)
    return adsConversionEventRepository.listExportSegmentRows(parsed, tx)
  }

  /**
   * Analytics-only "All channels" export (decision 6) — a SEPARATE method
   * from `listExportRows`, parsed by the dedicated
   * `listAllChannelAdsExportRowsInput` schema (no `channel`/integration
   * fields at all), rather than an `allChannels` branch bolted onto
   * `listExportRows`. `listExportRows`'s legacy omitted-`channel` param path
   * stays byte-unchanged.
   */
  listAllChannelExportRows(
    input: ListAllChannelAdsExportRowsInput,
    tx?: DatabaseClient,
  ) {
    const parsed = listAllChannelAdsExportRowsInput.parse(input)
    return adsConversionEventRepository.listExportSegmentRows(
      { ...parsed, allChannels: true },
      tx,
    )
  }

  listRetargetContacts(input: ListRetargetContactsInput, tx?: DatabaseClient) {
    const parsed = listRetargetContactsInput.parse(input)
    return adsConversionEventRepository.listExportSegmentRows(parsed, tx)
  }

  private toInsertValues(
    input: CreateAdsConversionRuleInput,
  ): Omit<typeof adsConversionRuleModel.$inferInsert, "id"> {
    const trigger = parseTrigger(input.trigger)
    assertSupportedTrigger(trigger, input.channel)

    return {
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationWhatsappId: input.integrationWhatsappId ?? null,
      integrationFacebookAdsId: input.integrationFacebookAdsId ?? null,
      integrationMessengerId: input.integrationMessengerId ?? null,
      integrationInstagramId: input.integrationInstagramId ?? null,
      adAccountId: input.adAccountId ?? null,
      eventType: input.eventType,
      trigger,
      markAs: input.markAs ?? null,
      enabled: input.enabled ?? true,
    }
  }

  private toUpdateValues(
    input: UpdateAdsConversionRuleInput,
    effectiveChannel: AdsConversionChannel,
  ): AdsConversionRuleUpdateValues {
    const trigger =
      input.trigger === undefined ? undefined : parseTrigger(input.trigger)
    if (trigger) {
      assertSupportedTrigger(trigger, effectiveChannel)
    }

    return {
      channel: input.channel,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationFacebookAdsId: input.integrationFacebookAdsId,
      integrationMessengerId: input.integrationMessengerId,
      integrationInstagramId: input.integrationInstagramId,
      adAccountId: input.adAccountId,
      eventType: input.eventType,
      trigger,
      markAs: input.markAs,
      enabled: input.enabled,
    }
  }
}

export const adsConversionService = new AdsConversionService()
