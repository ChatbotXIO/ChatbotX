import { requiresSpecialAdCategoryCountry } from "@chatbotx.io/integration-facebook-ads/messaging-ads/constants"
import { z } from "zod"

export type WizardMessagingAdChannel = "messenger" | "instagram" | "whatsapp"

export const WIZARD_STEP_COUNT = 4

/** Meta's targeting age breakpoints — a discrete select, matching Meta Ads Manager's own age picker rather than free-text/every integer. */
export const AGE_OPTIONS = [
  13, 18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65,
] as const

export const genderOptions = [
  { value: "1", label: "adsCampaign.fields.gender.male" },
  { value: "2", label: "adsCampaign.fields.gender.female" },
] as const

/**
 * Selectable special ad categories. Meta's `special_ad_categories` is an array
 * and multiple may be combined (e.g. Housing + Employment). "NONE" is not a
 * selectable option — an empty selection already means "no special category".
 * `CREDIT` is intentionally excluded: Meta deprecated it on 2025-01-14 and now
 * REJECTS campaign creates that use it, so it is replaced by
 * `FINANCIAL_PRODUCTS_SERVICES` (they are also mutually exclusive per Meta).
 */
export const specialAdCategoryOptions = [
  { value: "HOUSING", label: "adsCampaign.specialAdCategory.housing" },
  { value: "EMPLOYMENT", label: "adsCampaign.specialAdCategory.employment" },
  {
    value: "FINANCIAL_PRODUCTS_SERVICES",
    label: "adsCampaign.specialAdCategory.financialProducts",
  },
  {
    value: "ISSUES_ELECTIONS_POLITICS",
    label: "adsCampaign.specialAdCategory.issues",
  },
  {
    value: "ONLINE_GAMBLING_AND_GAMING",
    label: "adsCampaign.specialAdCategory.onlineGambling",
  },
] as const

// Housing / Employment / Financial products & services strip
// age/gender/detailed targeting (Meta's HEF restriction). Issues/elections/
// politics and online gambling carry different rules, not the targeting strip.
export const RESTRICTED_SPECIAL_AD_CATEGORIES = new Set([
  "HOUSING",
  "EMPLOYMENT",
  "FINANCIAL_PRODUCTS_SERVICES",
])

export const MAX_WELCOME_MESSAGE_TEMPLATES = 5

export const welcomeMessageTemplateSchema = z.object({
  heading: z.string().trim().max(80),
  message: z.string().trim().min(1).max(2000),
})

/**
 * Flat, RHF-friendly form model — every field is REQUIRED (no `.optional()`/
 * `.default()`) so `z.input` and `z.output` are identical and a single type
 * works for `useForm`, `useFormContext`, and the submit handler alike;
 * "unset" is represented by `""` / `[]` / `false`, matching `wizardDefaultValues`
 * (see feature-scaffold skill: never use `null`/`undefined` as a controlled
 * text-input default). The discriminated union shapes the business layer
 * actually needs (`WizardMedia`/`WizardWelcomeMessage`) are assembled from
 * this at submit time (`buildCreateMessagingAdRequest`). Every enumerable
 * field (special ad category, gender, age, country, ad account, WhatsApp
 * page) is a select/multi-select value, never free text — see
 * `campaign-step.tsx`/`ad-set-step.tsx`.
 */
const wizardObjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * Meta's `special_ad_categories` is an array — zero or more of
   * `specialAdCategoryOptions`. Empty = "NONE". The deprecated `CREDIT` value is
   * not offered (see `specialAdCategoryOptions`).
   */
  specialAdCategories: z.array(
    z.enum(
      specialAdCategoryOptions.map((o) => o.value) as [string, ...string[]],
    ),
  ),
  /** ISO-2 countries — Meta REQUIRES this whenever ANY special ad category is selected. */
  specialAdCategoryCountry: z.array(z.string()),
  adAccountId: z.string().trim().min(1),
  whatsappPageIntegrationId: z.string().trim(),
  dailyBudgetMinorUnits: z.number().int().positive(),
  countries: z.array(z.string()).min(1),
  // Held as the select's string option value (one of `AGE_OPTIONS`), not a
  // number, so the Select component's `value` always matches an item —
  // converted to a number only when building the API payload at submit.
  ageMin: z.string().trim(),
  ageMax: z.string().trim(),
  genders: z.array(z.enum(["1", "2"])),
  startTime: z.string().trim(),
  endTime: z.string().trim(),

  mediaKind: z.enum(["", "image", "video"]),
  // The S3 key + minted `File` row id from the presigned upload — never a
  // Meta `image_hash` (that is derived transiently at create time, see
  // `resolveStoredImageBytes` in `@chatbotx.io/business`).
  imageKey: z.string().trim(),
  fileId: z.string().trim(),
  imageMimeType: z.string().trim(),
  imageFileName: z.string().trim(),
  imagePreviewUrl: z.string().trim(),
  imageLink: z.string().trim(),
  imageMessage: z.string().trim().max(500),
  imageHeadline: z.string().trim().max(40),
  imageDescription: z.string().trim().max(200),
  imageCaption: z.string().trim().max(30),

  videoId: z.string().trim(),
  videoReady: z.boolean(),
  videoThumbnailHash: z.string().trim(),
  videoTitle: z.string().trim().max(40),
  videoMessage: z.string().trim().max(500),
  videoLinkDescription: z.string().trim().max(200),

  welcomeMessageType: z.enum(["default", "single", "templates"]),
  welcomeMessageSingle: z.string().trim().max(2000),
  welcomeMessageTemplates: z
    .array(welcomeMessageTemplateSchema)
    .max(MAX_WELCOME_MESSAGE_TEMPLATES),
})

/**
 * Channel-aware validation: CTWA additionally requires a linked Facebook Page
 * (`whatsappPageIntegrationId`) because Meta's CTWA `promoted_object` needs a
 * `page_id` the WhatsApp integration itself doesn't carry. The wizard is
 * instantiated per channel, so the resolver is built from the acting channel.
 */
export function buildWizardFormSchema(channel: WizardMessagingAdChannel) {
  return wizardObjectSchema.superRefine((values, ctx) => {
    if (channel === "whatsapp" && !values.whatsappPageIntegrationId) {
      ctx.addIssue({
        code: "custom",
        path: ["whatsappPageIntegrationId"],
        message: "Select a Facebook Page",
      })
    }
    // Meta requires a country ONLY for the social issues/elections/politics
    // category — for HOUSING/EMPLOYMENT/CREDIT/FINANCIAL it defaults to the ad
    // account's tax country, so it stays optional there.
    if (
      requiresSpecialAdCategoryCountry(values.specialAdCategories) &&
      values.specialAdCategoryCountry.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["specialAdCategoryCountry"],
        message: "Select at least one country for the special ad category",
      })
    }
    if (
      values.mediaKind === "image" &&
      !(values.imageKey && values.fileId && values.imageLink)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaKind"],
        message: "Image upload and link are required",
      })
    }
    if (
      values.mediaKind === "video" &&
      !(values.videoId && values.videoReady)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mediaKind"],
        message: "Video must finish processing before continuing",
      })
    }
    if (values.mediaKind === "") {
      ctx.addIssue({
        code: "custom",
        path: ["mediaKind"],
        message: "Upload an image or video",
      })
    }
    if (
      values.welcomeMessageType === "single" &&
      !values.welcomeMessageSingle
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["welcomeMessageSingle"],
        message: "Message is required",
      })
    }
    if (
      values.welcomeMessageType === "templates" &&
      values.welcomeMessageTemplates.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["welcomeMessageTemplates"],
        message: "At least one template is required",
      })
    }
  })
}

/** Default (channel-agnostic) schema — the form VALUE shape and the base for tests. */
export const wizardFormSchema = buildWizardFormSchema("messenger")

export type WizardFormValues = z.infer<typeof wizardObjectSchema>

export const wizardDefaultValues: WizardFormValues = {
  name: "",
  specialAdCategories: [],
  specialAdCategoryCountry: [],
  adAccountId: "",
  whatsappPageIntegrationId: "",
  dailyBudgetMinorUnits: 0,
  countries: [],
  ageMin: "",
  ageMax: "",
  genders: [],
  startTime: "",
  endTime: "",
  mediaKind: "",
  imageKey: "",
  fileId: "",
  imageMimeType: "",
  imageFileName: "",
  imagePreviewUrl: "",
  imageLink: "",
  imageMessage: "",
  imageHeadline: "",
  imageDescription: "",
  imageCaption: "",
  videoId: "",
  videoReady: false,
  videoThumbnailHash: "",
  videoTitle: "",
  videoMessage: "",
  videoLinkDescription: "",
  welcomeMessageType: "default",
  welcomeMessageSingle: "",
  welcomeMessageTemplates: [],
}

/** Per-step field names, used to validate only the active step via `form.trigger(...)`. */
export const STEP_FIELDS: (keyof WizardFormValues)[][] = [
  ["name", "specialAdCategories", "specialAdCategoryCountry"],
  [
    "adAccountId",
    "whatsappPageIntegrationId",
    "dailyBudgetMinorUnits",
    "countries",
    "ageMin",
    "ageMax",
    "genders",
    "startTime",
    "endTime",
  ],
  [
    "mediaKind",
    "imageKey",
    "fileId",
    "imageLink",
    "videoId",
    "videoReady",
    "welcomeMessageType",
    "welcomeMessageSingle",
    "welcomeMessageTemplates",
  ],
  [],
]
