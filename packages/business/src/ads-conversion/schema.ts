import {
  adsConversionChannelSchema,
  adsConversionEventTypeSchema,
  adsConversionRuleModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const nonEmptyStringArray = z.array(z.string().trim().min(1)).min(1)

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

export const evaluateTemplateSentInput = z.object({
  workspaceId: zodBigintAsString(),
  integrationWhatsappId: zodBigintAsString(),
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

export const evaluateConversionTriggerInput = z.object({
  workspaceId: zodBigintAsString(),
  integrationWhatsappId: zodBigintAsString(),
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

const ctwaFunnelShape = ctwaDateRangeShape.extend({
  integrationWhatsappId: zodBigintAsString().optional(),
})

export const getCtwaFunnelInput = withOrderedDateRange(ctwaFunnelShape)
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

export const retargetAdInput = z
  .object({
    segment: adsConversionExportSegments,
    adId: z.string().trim().min(1).nullable().optional(),
    since: z.coerce.date(),
    until: z.coerce.date(),
    integrationWhatsappId: zodBigintAsString().optional(),
    adAccountId: z.string().trim().min(1),
    audienceName: z.string().trim().min(1).optional(),
    customAudienceId: z.string().trim().min(1).optional(),
  })
  .refine((input) => input.audienceName || input.customAudienceId, {
    message: "audienceName or customAudienceId is required",
    path: ["audienceName"],
  })
export type RetargetAdInput = z.input<typeof retargetAdInput>
