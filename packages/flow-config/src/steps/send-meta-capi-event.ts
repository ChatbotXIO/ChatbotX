import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  defaultMetaCapiActionSource,
  eventNamesByCatalog,
  type MetaCapiActionSource,
  metaCapiActionSourcePolicy,
  metaCapiActionSourceSchema,
  metaCapiBusinessMessagingEventNames,
  metaCapiContentTypeSchema,
  metaCapiEventNameSchema,
} from "@chatbotx.io/utils/meta-capi"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

// Treat an empty/blank string (a cleared input field) as "unset" so users can
// remove a previously entered value/currency without hitting regex validation.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

/**
 * `value`, `currency` and `contentIds` each accept either a static value
 * (validated/normalized by `staticSchema`) or a `{{variable}}` template,
 * passed through untouched — a static schema's `.toUpperCase()` or regex
 * would otherwise corrupt/reject a template placeholder such as
 * `{{currency_field}}` or `{{order_total}}`.
 */
export const templateOrStatic = <TOutput>(
  staticSchema: z.ZodType<TOutput, string>,
) =>
  z.string().transform((value, ctx): TOutput | string => {
    if (containsVariablePlaceholder(value)) {
      return value
    }

    const result = staticSchema.safeParse(value)
    if (result.success) {
      return result.data
    }

    for (const issue of result.error.issues) {
      ctx.addIssue(issue.message)
    }
    return z.NEVER
  })

const metaCapiValueStaticSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)

const metaCapiCurrencyStaticSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/))

const metaCapiContentIdsStaticSchema = z.string().trim().min(1)

/**
 * Shared shape for the three template-or-static optional fields below: treat
 * a blank string as unset, otherwise accept either a `{{variable}}`
 * placeholder or a value matching `staticSchema`.
 */
const optionalTemplateOrStatic = <TOutput>(
  staticSchema: z.ZodType<TOutput, string>,
) => z.preprocess(blankToUndefined, templateOrStatic(staticSchema).optional())

const metaCapiValueSchema = optionalTemplateOrStatic(metaCapiValueStaticSchema)

const metaCapiCurrencySchema = optionalTemplateOrStatic(
  metaCapiCurrencyStaticSchema,
)

// Comma-separated Meta `content_ids` (e.g. "123,456" or "{{a}},{{b}}"); split
// into a `string[]` at the business-layer boundary (`enqueueEventInput`), not
// here — the flow-field value is a plain template-or-static string.
const metaCapiContentIdsSchema = optionalTemplateOrStatic(
  metaCapiContentIdsStaticSchema,
)

// Optional Meta Pixel content properties (content_category / content_name),
// passed through CAPI custom_data.
const metaCapiContentTextSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(200).optional(),
)

/**
 * Event names requiring `value`/`currency`. Meta: "Required for purchase
 * events" — every other standard or custom event is optional.
 */
const eventsRequiringValueAndCurrency: ReadonlySet<string> = new Set([
  "Purchase",
])

/**
 * Minimal shape both `superRefine` callbacks below are typed against, so the
 * same callbacks are assignable to any host schema that carries these four
 * fields — the flow-step schema here, the builder trigger-action schema, and
 * `enqueueEventInput` in `packages/business` (where `contentIds` is already
 * a `string[]`, a field these callbacks never read).
 */
export type MetaCapiEventRefinementFields = {
  eventName: string
  actionSource: MetaCapiActionSource
  value?: string
  currency?: string
}

/** Purchase requires `value` and `currency`; every other event is optional. */
export const requireValueAndCurrencyForEvent = (
  data: MetaCapiEventRefinementFields,
  ctx: z.RefinementCtx,
): void => {
  if (!eventsRequiringValueAndCurrency.has(data.eventName)) {
    return
  }

  if (!data.value) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: `Value is required for ${data.eventName} events`,
    })
  }

  if (!data.currency) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: `Currency is required for ${data.eventName} events`,
    })
  }
}

/**
 * Which event names are valid is a property of `actionSource`'s catalog —
 * `business_messaging` only offers its 14 documented events (no custom
 * names); every other action source offers the 17 Meta Pixel standard
 * events plus custom names (already bounded to <=50 chars by
 * `metaCapiEventNameSchema` at the field level). A custom name is never
 * allowed to shadow the *other* catalog's standard event name (e.g.
 * `LeadSubmitted` — a business-messaging event — is not a valid custom
 * name for a pixel-catalog action source such as `email`), since that name
 * is already reserved for the other, semantically distinct, action source.
 */
export const requireEventNameAllowedForActionSource = (
  data: MetaCapiEventRefinementFields,
  ctx: z.RefinementCtx,
): void => {
  const policy = metaCapiActionSourcePolicy[data.actionSource]
  const ownCatalogNames = eventNamesByCatalog[policy.eventCatalog]

  if (ownCatalogNames.includes(data.eventName)) {
    return
  }

  if (!policy.allowsCustomEventNames) {
    ctx.addIssue({
      code: "custom",
      path: ["eventName"],
      message: `"${data.eventName}" is not a supported event for the ${data.actionSource} action source`,
    })
    return
  }

  // Only the pixel catalog reaches here (it is the only catalog that allows
  // custom names) — a custom name must not shadow a business-messaging
  // catalog standard event name, which is reserved for that other,
  // semantically distinct, action source.
  if (
    (metaCapiBusinessMessagingEventNames as readonly string[]).includes(
      data.eventName,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["eventName"],
      message: `"${data.eventName}" is reserved by another action source's event catalog and cannot be used as a custom event name`,
    })
  }
}

/**
 * Shared field-set schema, reused by the flow step (this file), the builder
 * trigger action, and the worker trigger executor's `safeParse` of the
 * stored trigger action object.
 */
export const metaCapiEventFieldsSchema = z.object({
  eventName: metaCapiEventNameSchema.default("LeadSubmitted"),
  actionSource: metaCapiActionSourceSchema.default(defaultMetaCapiActionSource),
  contentType: metaCapiContentTypeSchema.optional(),
  contentIds: metaCapiContentIdsSchema,
  value: metaCapiValueSchema,
  currency: metaCapiCurrencySchema,
  contentCategory: metaCapiContentTextSchema,
  contentName: metaCapiContentTextSchema,
})
export type MetaCapiEventFieldsSchema = z.infer<
  typeof metaCapiEventFieldsSchema
>

/**
 * The two cross-field rules every host of the CAPI fields applies — flow
 * step, trigger action (builder + worker), the dialog resolver and the
 * business `enqueueEventInput`. One composition so a rule added later cannot
 * reach some hosts and not others.
 */
export const withMetaCapiEventRefinements = <
  TSchema extends z.ZodType<MetaCapiEventRefinementFields>,
>(
  schema: TSchema,
): TSchema =>
  schema
    .superRefine(requireValueAndCurrencyForEvent)
    .superRefine(requireEventNameAllowedForActionSource)

export const sendMetaCapiEventSchema = withMetaCapiEventRefinements(
  metaCapiEventFieldsSchema.extend({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.sendMetaCapiEvent),
    states: z.tuple([successStateSchema, errorStateSchema]),
  }),
)
export type SendMetaCapiEventSchema = z.infer<typeof sendMetaCapiEventSchema>

export const sendMetaCapiEventDefaultFn = (): SendMetaCapiEventSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendMetaCapiEvent,
  eventName: "LeadSubmitted",
  actionSource: "business_messaging",
  contentType: undefined,
  contentIds: undefined,
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
