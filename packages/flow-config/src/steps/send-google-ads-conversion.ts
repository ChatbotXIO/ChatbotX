import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import {
  googleAdsCustomerTypes,
  googleAdsCustomerValueBuckets,
  hasRfc3339Shape,
  isGoogleAdsMatchTemplate,
  isRfc3339WithZone,
} from "@chatbotx.io/utils/google-click"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { optionalTemplateOrStatic } from "./send-meta-capi-event"
import { stepTypes } from "./step-action"

// Google Ads conversion action ids are numeric. Defined locally: flow-config
// cannot depend on `@chatbotx.io/business` or the Google Ads integration, whose
// Data Manager client validates the same pattern.
const conversionActionIdPattern = /^\d+$/

const DEDUP_ID_MAX_LENGTH = 64

const validationKey = (key: string) =>
  `googleAds.conversionFields.validation.${key}`

// Same rules as the Meta CAPI value / currency, with i18n keys as messages
// (the step form renders these through `TranslatedFieldMessage`).
const valueStaticSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, validationKey("valueInvalid"))
  .refine(
    (value) => Number(value) <= Number.MAX_SAFE_INTEGER,
    validationKey("valueTooLarge"),
  )

const currencyStaticSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, validationKey("currencyInvalid")))

/**
 * A customer-matching source is ONE `{{variable}}` (`{{email}}`, `{{phone}}`, a
 * custom field...) and nothing else: a literal e-mail or number would put
 * personal data in the saved flow, and it is the same for every contact anyway.
 * Blank means "not sent".
 */
const matchTemplateSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .refine(isGoogleAdsMatchTemplate, validationKey("matchTemplateInvalid")),
])

// Static values are case-insensitive; a `{{variable}}` is resolved at runtime.
const customerTypeStaticSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z.enum(
      googleAdsCustomerTypes.options,
      validationKey("customerTypeInvalid"),
    ),
  )

const customerValueBucketStaticSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z.enum(
      googleAdsCustomerValueBuckets.options,
      validationKey("customerValueBucketInvalid"),
    ),
  )

export const googleAdsDedupModeSchema = z.enum(["click", "id", "event"])

// Lenient on purpose: the length limit only matters in `id` mode, so it is
// checked by `requireDedupIdForIdMode`, never on a value a `click` step hides.
const dedupIdStaticSchema = z.string().trim().min(1)

/** Format and calendar validity only; "in the future" is a runtime refusal. */
const conversionTimeStaticSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    if (!hasRfc3339Shape(value)) {
      ctx.addIssue({ code: "custom", message: validationKey("timeFormat") })
    } else if (!isRfc3339WithZone(value)) {
      ctx.addIssue({
        code: "custom",
        message: validationKey("timeInvalidDate"),
      })
    }
  })

/**
 * Minimal shape the cross-field refinement is typed against, so it is
 * assignable to every host of the fields (flow step here, builder trigger
 * action form, worker trigger executor).
 */
export type GoogleAdsConversionRefinementFields = {
  value?: string
  currency?: string
  dedupMode: z.infer<typeof googleAdsDedupModeSchema>
  dedupId?: string
}

/** `value` and `currency` are supplied together, or not at all. */
export const requireValueAndCurrencyTogether = (
  data: GoogleAdsConversionRefinementFields,
  ctx: z.RefinementCtx,
): void => {
  if (data.value && !data.currency) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: validationKey("currencyRequired"),
    })
  }

  if (data.currency && !data.value) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: validationKey("valueRequired"),
    })
  }
}

/**
 * `id` mode needs the order or event ID the identity is built from, within
 * the length limit. A template is not length-checked here (its resolved value
 * is validated at runtime); a leftover value in `click` mode is ignored.
 */
export const requireDedupIdForIdMode = (
  data: GoogleAdsConversionRefinementFields,
  ctx: z.RefinementCtx,
): void => {
  if (data.dedupMode !== "id") {
    return
  }

  if (!data.dedupId) {
    ctx.addIssue({
      code: "custom",
      path: ["dedupId"],
      message: validationKey("dedupIdRequired"),
    })
    return
  }

  if (
    data.dedupId.length > DEDUP_ID_MAX_LENGTH &&
    !containsVariablePlaceholder(data.dedupId)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["dedupId"],
      message: validationKey("dedupIdTooLong"),
    })
  }
}

/**
 * Shared field-set schema, reused by the flow step (this file), the builder
 * trigger action, and the worker trigger executor's `safeParse` of the stored
 * trigger action object. Apply {@link withGoogleAdsConversionRefinements} on
 * top of it.
 */
export const googleAdsConversionFieldsSchema = z.object({
  conversionActionId: z
    .string()
    .regex(conversionActionIdPattern, validationKey("conversionActionRequired"))
    .describe(
      "Numeric id of the Google Ads conversion action to record, picked from the workspace's synced conversion actions.",
    ),
  value: optionalTemplateOrStatic(valueStaticSchema).describe(
    "Monetary value of the conversion as a decimal string, e.g. `49.90`, or a `{{variable}}`. Must be set together with `currency`.",
  ),
  currency: optionalTemplateOrStatic(currencyStaticSchema).describe(
    "ISO 4217 currency code, e.g. `USD`, or a `{{variable}}`. Must be set together with `value`.",
  ),
  dedupMode: googleAdsDedupModeSchema.describe(
    'How duplicate conversions are avoided: "click" counts this conversion action once per ad click (recommended for leads, sign-ups, bookings); "id" counts it once per `dedupId` (recommended for purchases and anything that can repeat); "event" records a new conversion every time the step runs, still safe against retries of the same run. Required.',
  ),
  dedupId: optionalTemplateOrStatic(dedupIdStaticSchema).describe(
    'Order or event ID, required when `dedupMode` is "id" and then up to 64 characters (or a `{{variable}}`); ignored when `dedupMode` is "click" or "event". Must stay the same across retries and be different for each purchase or event; never use the current time or a random value.',
  ),
  matchEmail: matchTemplateSchema
    .optional()
    .describe(
      "Customer matching: a single `{{variable}}` that resolves to the contact's e-mail, e.g. `{{email}}` or a custom field. Hashed server-side when the conversion is sent, and only when ad user data consent is granted. Blank sends nothing; literal addresses are rejected.",
    ),
  matchPhone: matchTemplateSchema
    .optional()
    .describe(
      "Customer matching: a single `{{variable}}` that resolves to the contact's phone number, e.g. `{{phone}}` or a custom field. It must be an international number; anything else is not sent. Same rules as `matchEmail`.",
    ),
  customerType: optionalTemplateOrStatic(customerTypeStaticSchema).describe(
    'Optional: whether the customer is "NEW" or "RETURNING" when the conversion happened, or a `{{variable}}`. Sent to Google as a user property, only when ad user data consent is granted. Blank sends nothing.',
  ),
  customerValueBucket: optionalTemplateOrStatic(
    customerValueBucketStaticSchema,
  ).describe(
    'Optional: how valuable the customer is, "LOW", "MEDIUM" or "HIGH", or a `{{variable}}`. Same rules as `customerType`.',
  ),
  conversionTime: optionalTemplateOrStatic(conversionTimeStaticSchema).describe(
    "Optional time the conversion happened: a date-time with a timezone such as `2026-10-08T14:30:00+07:00`, or a `{{variable}}`. Leave unset to use the time the step runs. Cannot be in the future.",
  ),
})
export type GoogleAdsConversionFieldsSchema = z.infer<
  typeof googleAdsConversionFieldsSchema
>

/** Every host of the fields applies the same cross-field rule. */
export const withGoogleAdsConversionRefinements = <
  TSchema extends z.ZodType<GoogleAdsConversionRefinementFields>,
>(
  schema: TSchema,
): TSchema =>
  schema.superRefine((data, ctx) => {
    requireValueAndCurrencyTogether(data, ctx)
    requireDedupIdForIdMode(data, ctx)
  })

export const sendGoogleAdsConversionSchema = withGoogleAdsConversionRefinements(
  googleAdsConversionFieldsSchema.extend({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.sendGoogleAdsConversion)
      .describe('Step type discriminator: "sendGoogleAdsConversion".'),
    states: z.tuple([successStateSchema, errorStateSchema]),
  }),
)
export type SendGoogleAdsConversionSchema = z.infer<
  typeof sendGoogleAdsConversionSchema
>

export const sendGoogleAdsConversionDefaultFn =
  (): SendGoogleAdsConversionSchema => ({
    id: createId(),
    stepType: stepTypes.enum.sendGoogleAdsConversion,
    conversionActionId: "",
    value: undefined,
    currency: undefined,
    dedupMode: "id",
    dedupId: undefined,
    matchEmail: undefined,
    matchPhone: undefined,
    customerType: undefined,
    customerValueBucket: undefined,
    conversionTime: undefined,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
