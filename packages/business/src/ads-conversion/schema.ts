import {
  adsConversionChannelSchema,
  adsConversionEventTypeSchema,
  adsConversionRuleModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import {
  assertPurchaseValueMatchesContents,
  metaCapiContentsSchema,
  metaCapiCurrencySchema,
  metaCapiOrderIdSchema,
  metaCapiValueSchema,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const nonEmptyStringArray = z.array(z.string().trim().min(1)).min(1)

/**
 * Richer Purchase data (plan #4) — `orderId`/`contents` are Purchase-only;
 * a Lead event carrying either is a caller bug, rejected here rather than
 * silently dropped (Codex #4). Shared by `recordTriggerConversionInput` and
 * `recordFlowStepConversionInput` (the Trigger action / flow-step bridges
 * into `recordAdsConversion`) so the rule can't drift between the two.
 */
function rejectPurchaseFieldsOnNonPurchase(input: {
  eventType: string
  orderId?: string
  contents?: unknown[]
}): boolean {
  if (input.eventType === "purchase") {
    return true
  }
  return !(input.orderId || input.contents)
}

export const adsConversionRuleTriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("templateSent"),
    templateIds: nonEmptyStringArray,
  }),
  z.object({
    type: z.literal("tagApplied"),
    tagIds: nonEmptyStringArray,
  }),
  z.object({
    type: z.literal("keywordMatched"),
    automatedResponseIds: nonEmptyStringArray,
  }),
  z.object({
    type: z.literal("contactReplied"),
    firstReplyOnly: z.boolean(),
  }),
])
export type AdsConversionRuleTrigger = z.infer<
  typeof adsConversionRuleTriggerSchema
>
export type AdsConversionRuleTriggerType = AdsConversionRuleTrigger["type"]

export const adsConversionRuleResource = createSelectSchema(
  adsConversionRuleModel,
  {
    id: zodBigintAsString(),
    workspaceId: zodBigintAsString(),
    integrationWhatsappId: zodBigintAsString().nullable(),
    integrationFacebookAdsId: zodBigintAsString().nullable(),
    integrationMessengerId: zodBigintAsString().nullable(),
    integrationInstagramId: zodBigintAsString().nullable(),
    trigger: adsConversionRuleTriggerSchema,
  },
)
export type AdsConversionRuleResource = z.infer<
  typeof adsConversionRuleResource
>

export const listAdsConversionRulesInput = z.object({
  workspaceId: zodBigintAsString(),
  channel: adsConversionChannelSchema.optional(),
})
export type ListAdsConversionRulesInput = z.infer<
  typeof listAdsConversionRulesInput
>

export const createAdsConversionRuleInput = z.object({
  workspaceId: zodBigintAsString(),
  channel: adsConversionChannelSchema,
  integrationWhatsappId: zodBigintAsString().nullable().optional(),
  integrationFacebookAdsId: zodBigintAsString().nullable().optional(),
  // Messenger/Instagram FKs (Phase 2 generalization) — mirrors
  // AdsConversionRule's per-channel FK columns (Phase 1 schema).
  integrationMessengerId: zodBigintAsString().nullable().optional(),
  integrationInstagramId: zodBigintAsString().nullable().optional(),
  adAccountId: z.string().trim().min(1).nullable().optional(),
  eventType: adsConversionEventTypeSchema,
  trigger: adsConversionRuleTriggerSchema,
  markAs: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
})
export type CreateAdsConversionRuleInput = z.infer<
  typeof createAdsConversionRuleInput
>

export const updateAdsConversionRuleInput = createAdsConversionRuleInput
  .partial()
  .extend({
    id: zodBigintAsString(),
    workspaceId: zodBigintAsString(),
  })
export type UpdateAdsConversionRuleInput = z.infer<
  typeof updateAdsConversionRuleInput
>

export const toggleAdsConversionRuleInput = z.object({
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
  enabled: z.boolean(),
})
export type ToggleAdsConversionRuleInput = z.infer<
  typeof toggleAdsConversionRuleInput
>

export const removeAdsConversionRuleInput = z.object({
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
export type RemoveAdsConversionRuleInput = z.infer<
  typeof removeAdsConversionRuleInput
>

export const automaticAdsConversionEventPayloadSchema = z.object({
  event_name: z.enum(["LeadSubmitted", "Purchase"]),
  id: z.string().trim().min(1),
  timestamp: z.union([z.number(), z.string().trim().min(1)]),
  ctwa_clid: z.string().trim().min(1),
  custom_data: z
    .object({
      currency: z.string().trim().min(1),
      value: z.union([z.number(), z.string().trim().min(1)]),
    })
    .optional(),
})
export type AutomaticAdsConversionEventPayload = z.infer<
  typeof automaticAdsConversionEventPayloadSchema
>

export const ingestAutomaticAdsConversionEventInput = z.object({
  integrationWhatsappId: zodBigintAsString(),
  wabaId: z.string().trim().min(1),
  workspaceId: zodBigintAsString(),
  payload: automaticAdsConversionEventPayloadSchema,
})
export type IngestAutomaticAdsConversionEventInput = z.infer<
  typeof ingestAutomaticAdsConversionEventInput
>

/**
 * `channel`/`integrationId` (Amendment A1): WhatsApp keeps its `ctwaClid`
 * gate; Messenger gates on ad-referral attribution — see
 * `adsConversionService.evaluateTemplateSent`. Instagram has no template
 * entity/step, so the service rejects it rather than accepting a third
 * channel value here.
 */
export const evaluateTemplateSentInput = z.object({
  workspaceId: zodBigintAsString(),
  channel: adsConversionChannelSchema,
  integrationId: zodBigintAsString(),
  contactInboxId: zodBigintAsString(),
  templateId: z.string().trim().min(1),
})
export type EvaluateTemplateSentInput = z.infer<
  typeof evaluateTemplateSentInput
>

/**
 * The runtime "something happened" fact for every conversion trigger type
 * beyond `templateSent` (which keeps its own dedicated pipeline). Mirrors
 * `AdsConversionJobEvaluateConversionTrigger["data"]["occurrence"]` in
 * `@chatbotx.io/worker-config` — keep both in sync.
 */
export const evaluateConversionTriggerOccurrenceSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("tagApplied"),
      tagId: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal("keywordMatched"),
      automatedResponseId: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal("contactReplied"),
      isFirstReply: z.boolean(),
    }),
  ],
)
export type EvaluateConversionTriggerOccurrence = z.infer<
  typeof evaluateConversionTriggerOccurrenceSchema
>

/**
 * `channel`/`integrationId` generalize the previously WhatsApp-only
 * `integrationWhatsappId` field so this shape matches
 * `AdsConversionJobEvaluateConversionTrigger`'s payload 1:1 — the worker
 * handler stays a thin pass-through (Phase 3).
 */
export const evaluateConversionTriggerInput = z.object({
  workspaceId: zodBigintAsString(),
  channel: adsConversionChannelSchema,
  integrationId: zodBigintAsString(),
  contactInboxId: zodBigintAsString(),
  occurrence: evaluateConversionTriggerOccurrenceSchema,
})
export type EvaluateConversionTriggerInput = z.infer<
  typeof evaluateConversionTriggerInput
>

/**
 * Unrefined shapes are kept separate from their refined counterparts: zod
 * rejects `.extend()` calls that overwrite a key on a schema that already
 * carries a refinement, so the ordered-range check is applied at each leaf
 * schema instead of being inherited and re-extended.
 */
const ctwaDateRangeShape = z.object({
  workspaceId: zodBigintAsString(),
  since: z.coerce.date(),
  until: z.coerce.date(),
})

const withOrderedDateRange = <Schema extends typeof ctwaDateRangeShape>(
  schema: Schema,
) =>
  schema.refine((input) => input.since.getTime() <= input.until.getTime(), {
    message: "since must be before or equal to until",
    path: ["until"],
  })

/**
 * `channel`/`integrationMessengerId`/`integrationInstagramId` are additive
 * next to `integrationWhatsappId` (Phase 2 generalization) — omitted keeps
 * every pre-Phase-1 caller's WhatsApp-only behavior unchanged.
 *
 * `allChannels` is the "All channels" Ads Analytics dashboard's dedicated
 * flag — a separate boolean rather than a fake `channel: "all"` DB value so
 * it can never leak into `AdsConversionChannel`/`adsEligibleChannelTypes`-
 * gated writer paths (contact-filter, the worker's
 * `listRetargetContactsInput`, rule/event inserts). It means "drop the
 * channel filter entirely", never achieved by omitting `channel` — omitted
 * still defaults to whatsapp (`DEFAULT_ADS_CONVERSION_CHANNEL`) everywhere
 * else. Only this analytics range schema carries it; the shared export/
 * retarget writer schemas below (`listAdsConversionExportRowsInput`,
 * `listRetargetContactsInput`) deliberately do not.
 */
const ctwaFunnelShape = ctwaDateRangeShape.extend({
  integrationWhatsappId: zodBigintAsString().optional(),
  channel: adsConversionChannelSchema.optional(),
  integrationMessengerId: zodBigintAsString().optional(),
  integrationInstagramId: zodBigintAsString().optional(),
  allChannels: z.boolean().optional(),
  // Viewer IANA timezone for day-bucketing (`getCtwaFunnelTimeseries`'s
  // repository queries) — mirrors `message-stats.repository.ts`'s
  // `AT TIME ZONE ${timezone}` pattern. Omitted defaults to "UTC" at the
  // repository layer, so every pre-migration caller (this field didn't
  // exist before) keeps its exact prior day-bucketing behavior. `getCtwaFunnel`/
  // `getCapiDeliverySummary` accept it too (shared shape) but never use it —
  // neither buckets by day, only the already timezone-anchored [since, until]
  // window matters for them.
  timezone: z.string().optional(),
})

// `allChannels` aggregates across every ads-eligible channel/integration —
// there is no single integration to scope to, so combining it with any
// integration id is a caller bug (the builder page resolves `channel ===
// "all"` into `allChannels` BEFORE ever calling `perChannelIntegrationIds`,
// so a well-behaved caller never hits this).
export const getCtwaFunnelInput = withOrderedDateRange(ctwaFunnelShape).refine(
  (input) =>
    !(
      input.allChannels &&
      (input.integrationWhatsappId ||
        input.integrationMessengerId ||
        input.integrationInstagramId)
    ),
  {
    message: "allChannels cannot be combined with an integration id",
    path: ["allChannels"],
  },
)
export type GetCtwaFunnelInput = z.input<typeof getCtwaFunnelInput>

export const adsConversionExportSegments = z.enum([
  "conversations",
  "leads",
  "purchases",
])
export type AdsConversionExportSegment = z.infer<
  typeof adsConversionExportSegments
>

const adsConversionRowsShape = ctwaDateRangeShape.extend({
  segment: adsConversionExportSegments,
  adId: z.string().trim().min(1).nullable().optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  channel: adsConversionChannelSchema.optional(),
  integrationMessengerId: zodBigintAsString().optional(),
  integrationInstagramId: zodBigintAsString().optional(),
  afterId: zodBigintAsString().optional(),
})

/** CSV export reads larger pages than the audience sync, hence the two limits. */
export const listAdsConversionExportRowsInput = withOrderedDateRange(
  adsConversionRowsShape.extend({
    limit: z.number().int().positive().max(1000),
  }),
)
export type ListAdsConversionExportRowsInput = z.input<
  typeof listAdsConversionExportRowsInput
>

export const listRetargetContactsInput = withOrderedDateRange(
  adsConversionRowsShape.extend({
    limit: z.number().int().positive().max(500),
  }),
)
export type ListRetargetContactsInput = z.input<
  typeof listRetargetContactsInput
>

/**
 * Analytics-only "All channels" export — a SEPARATE shape from
 * `adsConversionRowsShape`/`listAdsConversionExportRowsInput`, not an
 * `allChannels` field bolted onto it: that shared shape backs BOTH the
 * legacy channel-scoped export AND the worker's retarget audience sync
 * (`listRetargetContactsInput`), and `channel`/integration ids there keep
 * their "omitted = whatsapp" writer-path default. This shape carries no
 * channel/integration fields at all — aggregating across every channel has
 * no single channel or integration to scope to — so there is nothing to
 * default and nothing for a zod refinement to reject.
 */
const allChannelAdsExportRowsShape = ctwaDateRangeShape.extend({
  segment: adsConversionExportSegments,
  adId: z.string().trim().min(1).nullable().optional(),
  afterId: zodBigintAsString().optional(),
})

export const listAllChannelAdsExportRowsInput = withOrderedDateRange(
  allChannelAdsExportRowsShape.extend({
    limit: z.number().int().positive().max(1000),
  }),
)
export type ListAllChannelAdsExportRowsInput = z.input<
  typeof listAllChannelAdsExportRowsInput
>

/**
 * Input for `adsConversionService.recordTriggerConversion` — the Trigger
 * automation actions `trackAdsLead`/`trackAdsPurchase`
 * (apps/worker/src/trigger/services/action-executor.ts). Deliberately takes
 * a bare `contactInboxId` (not `channel`/`inboxId` the way the tagApplied/
 * keywordMatched hook points do): the service loads the contact inbox itself
 * so a non-ads-eligible-channel contact inbox is a cheap one-indexed-lookup
 * no-op without the caller having to pre-resolve the channel.
 * `value`/`currency` are STATIC config only (same as `sendMetaCapiEvent`) —
 * no custom-field variable resolution.
 */
export const recordTriggerConversionInput = z
  .object({
    workspaceId: zodBigintAsString(),
    contactInboxId: zodBigintAsString(),
    triggerId: zodBigintAsString(),
    eventType: adsConversionEventTypeSchema,
    value: metaCapiValueSchema,
    currency: metaCapiCurrencySchema,
    orderId: metaCapiOrderIdSchema,
    contents: metaCapiContentsSchema,
  })
  .refine(rejectPurchaseFieldsOnNonPurchase, {
    message: "orderId/contents are only valid for purchase events",
    path: ["orderId"],
  })
  .refine(assertPurchaseValueMatchesContents, {
    message: "value must equal the sum of contents (quantity × item_price)",
    path: ["value"],
  })
export type RecordTriggerConversionInput = z.infer<
  typeof recordTriggerConversionInput
>

/**
 * Input for `adsConversionService.recordFlowStepConversion` — the Flow steps
 * `trackAdsLead`/`trackAdsPurchase`
 * (`packages/flow-config/src/steps/track-ads-{lead,purchase}.ts`). Mirrors
 * `recordTriggerConversionInput` field-for-field except `flowNodeId` replaces
 * `triggerId` — both are normalized into the same origin-aware core
 * (`recordAdsConversion` in `./record-ads-conversion`), which namespaces the
 * dedup key by origin kind (`trigger-...` vs `flowstep-...`) so the two never
 * collide. `value`/`currency` are STATIC config only (same as
 * `sendMetaCapiEvent`/`recordTriggerConversion`) — no custom-field variable
 * resolution.
 */
export const recordFlowStepConversionInput = z
  .object({
    workspaceId: zodBigintAsString(),
    contactInboxId: zodBigintAsString(),
    flowNodeId: zodBigintAsString(),
    eventType: adsConversionEventTypeSchema,
    value: metaCapiValueSchema,
    currency: metaCapiCurrencySchema,
    orderId: metaCapiOrderIdSchema,
    contents: metaCapiContentsSchema,
  })
  .refine(rejectPurchaseFieldsOnNonPurchase, {
    message: "orderId/contents are only valid for purchase events",
    path: ["orderId"],
  })
  .refine(assertPurchaseValueMatchesContents, {
    message: "value must equal the sum of contents (quantity × item_price)",
    path: ["value"],
  })
export type RecordFlowStepConversionInput = z.infer<
  typeof recordFlowStepConversionInput
>

export const retargetAdInput = z
  .object({
    segment: adsConversionExportSegments,
    adId: z.string().trim().min(1).nullable().optional(),
    since: z.coerce.date(),
    until: z.coerce.date(),
    integrationWhatsappId: zodBigintAsString().optional(),
    channel: adsConversionChannelSchema.optional(),
    integrationMessengerId: zodBigintAsString().optional(),
    integrationInstagramId: zodBigintAsString().optional(),
    adAccountId: z.string().trim().min(1),
    audienceName: z.string().trim().min(1).optional(),
    customAudienceId: z.string().trim().min(1).optional(),
  })
  .refine((input) => input.audienceName || input.customAudienceId, {
    message: "audienceName or customAudienceId is required",
    path: ["audienceName"],
  })
export type RetargetAdInput = z.input<typeof retargetAdInput>
