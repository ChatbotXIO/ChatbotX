import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type AdsConversionRuleUpdateValues,
  adsConversionEventRepository,
  adsConversionRuleRepository,
  contactInboxRepository,
  integrationFacebookAdsRepository,
  integrationWhatsappRepository,
  type WhatsappCtwaInboxRow,
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
  type ListRetargetContactsInput,
  listAdsConversionExportRowsInput,
  listAdsConversionRulesInput,
  listRetargetContactsInput,
  type RemoveAdsConversionRuleInput,
  removeAdsConversionRuleInput,
  type ToggleAdsConversionRuleInput,
  toggleAdsConversionRuleInput,
  type UpdateAdsConversionRuleInput,
  updateAdsConversionRuleInput,
} from "./schema"

// TTL for the hasEnabledTriggerRule boolean cache (HIGH-2): short enough that
// a newly created/enabled rule is picked up quickly even if the invalidation
// below is ever missed, long enough to absorb the "every inbound WhatsApp
// message" call volume from the contactReplied listener gate.
const HAS_TRIGGER_RULE_CACHE_TTL_SECONDS = 60

// One cache tag per workspace covers every integration/triggerType
// combination for that workspace — simpler and safer than trying to
// enumerate exactly which key(s) a rule mutation could affect (a rule's
// integrationWhatsappId can itself change on update).
const hasTriggerRuleCacheTag = (workspaceId: string): string =>
  `ads-conversion:has-trigger-rule:${workspaceId}`

// Channels CTWA (click-to-WhatsApp ad) attribution currently exists for.
// Single source of truth for the "is this message/contact-inbox eligible for
// ads-conversion trigger evaluation" pre-filter used by several call sites
// across worker/automated-response packages — see isEligibleChannel below.
const CTWA_ELIGIBLE_CHANNELS: ReadonlySet<string> = new Set(["whatsapp"])

type RuleIntegrationInput = {
  channel: AdsConversionChannel
  integrationWhatsappId?: string | null
  integrationFacebookAdsId?: string | null
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

const channelConsistencyValidators = {
  whatsapp: (input: RuleIntegrationInput) =>
    Boolean(input.integrationWhatsappId) && !input.integrationFacebookAdsId,
  facebook: (input: RuleIntegrationInput) =>
    Boolean(input.integrationFacebookAdsId) && !input.integrationWhatsappId,
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

function assertSupportedTrigger(
  trigger: RuleTrigger,
): asserts trigger is Extract<RuleTrigger, { type: SupportedRuleTriggerType }> {
  if (!supportedRuleTriggerTypes.has(trigger.type)) {
    throw new ChatbotXException(
      `Ads conversion trigger type "${trigger.type}" is not supported yet`,
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

// TODO(follow-up): this pipeline is left untouched by the generic trigger
// evaluator below on purpose (see evaluateConversionTriggerRule) to keep this
// PR's diff minimal. It has the same "enqueue failed after insert succeeded"
// gap that evaluateConversionTriggerRule closes with find-or-create +
// re-enqueue — port the same fix here in a follow-up.
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
  // job retries collapse to this deterministic occurrence id.
  const event = await adsConversionEventRepository.insertIgnoreDuplicate(
    {
      workspaceId: input.parsed.workspaceId,
      integrationWhatsappId: input.parsed.integrationWhatsappId,
      wabaId: input.attribution.wabaId,
      source: "rule",
      eventType: input.rule.eventType,
      ctwaClid: input.ctwaClid,
      adId: input.attribution.referral?.adId ?? null,
      contactInboxId: input.attribution.id,
      currency: null,
      value: null,
      occurredAt: input.now,
      sourceEventId: `rule-${input.rule.id}-inbox-${input.attribution.id}-${formatUtcDay(input.now)}`,
      capiStatus: "pending",
      capiSentAt: null,
    },
    input.tx,
  )
  if (!event) {
    return null
  }

  await enqueueIntegrationJob(
    {
      type: IntegrationJobAction.sendConversionEvent,
      data: {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
      },
    },
    {
      jobId: `ads-conversion-send-${event.id}`,
    },
  )

  return event
}

async function enqueueSendConversionEvent(
  event: Pick<AdsConversionEventModel, "id" | "workspaceId">,
): Promise<void> {
  await enqueueIntegrationJob(
    {
      type: IntegrationJobAction.sendConversionEvent,
      data: {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
      },
    },
    {
      jobId: `ads-conversion-send-${event.id}`,
    },
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
  const inserted = await adsConversionEventRepository.insertIgnoreDuplicate(
    {
      workspaceId: input.parsed.workspaceId,
      integrationWhatsappId: input.parsed.integrationWhatsappId,
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
    input.tx,
  )

  if (inserted) {
    await enqueueSendConversionEvent(inserted)
    return inserted
  }

  // Deduped: the event was already created by a previous evaluation of this
  // same rule/inbox/day. Recover it and, if its CAPI send never went out
  // (still pending), re-enqueue — see the doc comment above.
  const existing = await adsConversionEventRepository.findBySourceEventId(
    {
      workspaceId: input.parsed.workspaceId,
      integrationWhatsappId: input.parsed.integrationWhatsappId,
      source: "rule",
      sourceEventId,
    },
    input.tx,
  )
  if (existing?.capiStatus === "pending") {
    await enqueueSendConversionEvent(existing)
  }

  return null
}

export type CtwaFunnelAdRow = {
  adId: string | null
  adName?: string | null
  conversations: number
  leads: number
  purchases: number
  revenue: number
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
        values: this.toUpdateValues(parsed),
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
    integrationWhatsappId: string
    triggerType: AdsConversionRuleTriggerType
  }): Promise<boolean> {
    const key = `ads-conversion:has-trigger-rule:${input.workspaceId}:${input.integrationWhatsappId}:${input.triggerType}`

    return withCache(
      key,
      async () => {
        const rules = await adsConversionRuleRepository.listByWorkspace(
          input.workspaceId,
          {
            channel: "whatsapp",
            enabled: true,
            integrationWhatsappId: input.integrationWhatsappId,
          },
        )

        return rules.some(
          (rule) => parseTrigger(rule.trigger).type === input.triggerType,
        )
      },
      {
        ttl: HAS_TRIGGER_RULE_CACHE_TTL_SECONDS,
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
   */
  isEligibleChannel(channel: string | null | undefined): boolean {
    return channel != null && CTWA_ELIGIBLE_CHANNELS.has(channel)
  }

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

  async evaluateTemplateSent(
    input: EvaluateTemplateSentInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel[]> {
    const parsed = evaluateTemplateSentInput.parse(input)

    // Hot path ordering: first do the single contact-inbox attribution lookup,
    // then skip rule loading unless CTWA is present. Most template sends are
    // not ad-attributed, so this keeps the chat send pipeline's follow-up job
    // cheap in the common case.
    const attribution =
      await adsConversionEventRepository.findAttributionByContactInbox(
        {
          workspaceId: parsed.workspaceId,
          integrationWhatsappId: parsed.integrationWhatsappId,
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
        integrationWhatsappId: parsed.integrationWhatsappId,
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
   * Generic evaluator for every conversion trigger type beyond
   * `templateSent` (tagApplied, keywordMatched, contactReplied). Mirrors
   * `evaluateTemplateSent`'s shape (attribution lookup → skip if no CTWA →
   * load enabled whatsapp rules for the integration → match via
   * triggerHandlers → find-or-create the event) but delegates the
   * insert/dedupe/re-enqueue logic to evaluateConversionTriggerRule.
   */
  async evaluateConversionTrigger(
    input: EvaluateConversionTriggerInput,
    tx?: DatabaseClient,
  ): Promise<AdsConversionEventModel[]> {
    const parsed = evaluateConversionTriggerInput.parse(input)

    const attribution =
      await adsConversionEventRepository.findAttributionByContactInbox(
        {
          workspaceId: parsed.workspaceId,
          integrationWhatsappId: parsed.integrationWhatsappId,
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
        integrationWhatsappId: parsed.integrationWhatsappId,
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
   * (contactId, tagId) pair's WhatsApp-CTWA inboxes in ONE repository query
   * (grouped by contactId), instead of one query per pair — the fix for the
   * N+1 that `bulkAttachToContacts`/`attachToContact`/the builder bulk
   * contact-tag actions used to produce when looping `await
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
      const contactIds = [...new Set(input.pairs.map((pair) => pair.contactId))]
      const inboxes =
        await contactInboxRepository.listWhatsappCtwaInboxesByContacts({
          workspaceId: input.workspaceId,
          contactIds,
        })

      const inboxesByContactId = new Map<string, WhatsappCtwaInboxRow[]>()
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
              integrationWhatsappId: inbox.integrationWhatsappId,
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
   * WhatsApp conversation (`contactInbox` from `ExecuteStepProps`), so this
   * resolves and enqueues for that one contactInbox instead of fanning out to
   * every other WhatsApp-CTWA inbox the contact happens to have. Accepts many
   * tag ids so a step attaching several tags resolves the integration ONCE
   * rather than once per tag.
   */
  async enqueueTagAppliedEvaluationsForInbox(input: {
    workspaceId: string
    inboxId: string
    contactInboxId: string
    tagIds: string[]
  }): Promise<void> {
    if (input.tagIds.length === 0) {
      return
    }

    await this.safeEnqueue("tagApplied.forInbox", async () => {
      const integration =
        await integrationWhatsappRepository.findWorkspaceIntegrationByInboxId({
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
        })
      if (!integration) {
        return
      }

      const now = new Date()
      await Promise.all(
        input.tagIds.map((tagId) =>
          this.enqueueConversionTriggerJob({
            workspaceId: input.workspaceId,
            integrationWhatsappId: integration.id,
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
    inboxId: string
    contactInboxId: string
    tagId: string
  }): Promise<void> {
    await this.enqueueTagAppliedEvaluationsForInbox({
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      contactInboxId: input.contactInboxId,
      tagIds: [input.tagId],
    })
  }

  /**
   * `keywordMatched` hook point (dispatch-reply.ts) already has the specific
   * contactInbox/inboxId in scope from the conversation it matched on, so
   * this only has to resolve the WhatsApp integration id before enqueueing —
   * no contact-wide fan-out needed.
   */
  async enqueueKeywordMatchedEvaluation(input: {
    workspaceId: string
    inboxId: string
    contactInboxId: string
    automatedResponseId: string
    messageId: string
  }): Promise<void> {
    await this.safeEnqueue("keywordMatched", async () => {
      const integration =
        await integrationWhatsappRepository.findWorkspaceIntegrationByInboxId({
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
        })
      if (!integration) {
        return
      }

      await this.enqueueConversionTriggerJob({
        workspaceId: input.workspaceId,
        integrationWhatsappId: integration.id,
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
   * which already resolves+caches `integrationWhatsappId` per inbox across
   * the whole batch (see apps/worker/src/events/message/listener.ts) to
   * avoid one repository round trip per payload — so unlike the keyword
   * helper above, this takes it as a given rather than re-resolving it.
   */
  async enqueueContactRepliedEvaluation(input: {
    workspaceId: string
    integrationWhatsappId: string
    contactInboxId: string
    isFirstReply: boolean
    messageId: string
  }): Promise<void> {
    await this.enqueueConversionTriggerJob({
      workspaceId: input.workspaceId,
      integrationWhatsappId: input.integrationWhatsappId,
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
   * as `enqueueTemplateSentEvaluation` in the chat worker.
   */
  private async enqueueConversionTriggerJob(input: {
    workspaceId: string
    integrationWhatsappId: string
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
            integrationWhatsappId: input.integrationWhatsappId,
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
          integrationWhatsappId: input.integrationWhatsappId,
          contactInboxId: input.contactInboxId,
          occurrence: input.occurrence,
        },
        "Failed to enqueue ads conversion trigger evaluation",
      )
    }
  }

  async getCtwaFunnel(
    input: GetCtwaFunnelInput,
    tx?: DatabaseClient,
  ): Promise<CtwaFunnel> {
    const parsed = getCtwaFunnelInput.parse(input)

    // Date semantics: conversations use ContactInbox.firstInteractionAt, while
    // leads/purchases use AdsConversionEvent.occurredAt. Both are compared with
    // the same closed [since, until] UTC range supplied by the caller.
    const [conversationRows, eventRows] = await Promise.all([
      adsConversionEventRepository.countCtwaConversationsByAd(parsed, tx),
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
      }
      perAd.set(key, row)
      return row
    }

    for (const row of conversationRows) {
      getRow(row.adId).conversations = row.conversations
    }

    for (const row of eventRows) {
      const funnelRow = getRow(row.adId)
      if (row.eventType === "lead") {
        funnelRow.leads = row.count
      } else {
        funnelRow.purchases = row.count
        const revenue = Number(row.purchaseValue ?? 0)
        funnelRow.revenue = Number.isFinite(revenue) ? revenue : 0
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
      adsConversionEventRepository.countCtwaConversationsByDayAndAd(parsed, tx),
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

    for (const row of conversationRows) {
      getRow(row.date, row.adId).conversations = row.conversations
    }

    for (const row of eventRows) {
      const funnelRow = getRow(row.date, row.adId)
      if (row.eventType === "lead") {
        funnelRow.leads = row.count
      } else {
        funnelRow.purchases = row.count
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

  listRetargetContacts(input: ListRetargetContactsInput, tx?: DatabaseClient) {
    const parsed = listRetargetContactsInput.parse(input)
    return adsConversionEventRepository.listExportSegmentRows(parsed, tx)
  }

  private toInsertValues(
    input: CreateAdsConversionRuleInput,
  ): Omit<typeof adsConversionRuleModel.$inferInsert, "id"> {
    const trigger = parseTrigger(input.trigger)
    assertSupportedTrigger(trigger)

    return {
      workspaceId: input.workspaceId,
      channel: input.channel,
      integrationWhatsappId: input.integrationWhatsappId ?? null,
      integrationFacebookAdsId: input.integrationFacebookAdsId ?? null,
      adAccountId: input.adAccountId ?? null,
      eventType: input.eventType,
      trigger,
      markAs: input.markAs ?? null,
      enabled: input.enabled ?? true,
    }
  }

  private toUpdateValues(
    input: UpdateAdsConversionRuleInput,
  ): AdsConversionRuleUpdateValues {
    const trigger =
      input.trigger === undefined ? undefined : parseTrigger(input.trigger)
    if (trigger) {
      assertSupportedTrigger(trigger)
    }

    return {
      channel: input.channel,
      integrationWhatsappId: input.integrationWhatsappId,
      integrationFacebookAdsId: input.integrationFacebookAdsId,
      adAccountId: input.adAccountId,
      eventType: input.eventType,
      trigger,
      markAs: input.markAs,
      enabled: input.enabled,
    }
  }
}

export const adsConversionService = new AdsConversionService()
