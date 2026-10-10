import {
  googleAdsSetupErrorSchema,
  googleAdsUploadMethodSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const googleAdsReadinessSchema = z
  .enum(["ready", "needs_reauth", "setup_incomplete"])
  .describe(
    "`ready` can send conversions; `needs_reauth` needs the Google sign-in renewed; `setup_incomplete` needs an account or conversion action.",
  )

export const getGoogleAdsIntegrationRequest = z.object({
  workspaceId: zodBigintAsString(),
})

const googleAdsConversionActionResource = z.object({
  id: z.string().describe("Google conversion action ID."),
  name: z.string().describe("Conversion action name."),
  category: z.string().describe("Google conversion category."),
  status: z.string().describe("Google status, such as ENABLED."),
  countingType: z
    .string()
    .describe("How Google counts repeat conversions, such as ONE_PER_CLICK."),
  /** `EXTERNAL` = third-party attribution, which Data Manager cannot receive. */
  attributionModel: z
    .string()
    .nullable()
    .describe(
      "Attribution model. `EXTERNAL` (third-party attribution) cannot receive Data Manager uploads.",
    ),
})
export type GoogleAdsConversionActionResource = z.infer<
  typeof googleAdsConversionActionResource
>

const googleAdsConsentSettingViewSchema = z.object({
  type: z
    .enum(["notProvided", "granted", "denied", "variable"])
    .describe(
      "Fixed value, or `variable` to read it from a contact field at send time.",
    ),
  /** Only set for `variable`. */
  template: z
    .string()
    .nullable()
    .describe("Variable template; only set when type is `variable`."),
})
export type GoogleAdsConsentSettingView = z.infer<
  typeof googleAdsConsentSettingViewSchema
>

/** Workspace consent as stored, independent of any connection. Settings are null only when `invalid`. */
const googleAdsConsentViewSchema = z.object({
  status: z
    .enum(["absent", "ok", "invalid"])
    .describe(
      "`absent` when never saved, `invalid` when the stored value is unreadable.",
    ),
  adUserData: googleAdsConsentSettingViewSchema
    .nullable()
    .describe("Consent to use conversion data for ads; null when invalid."),
  adPersonalization: googleAdsConsentSettingViewSchema
    .nullable()
    .describe("Consent to ad personalization; null when invalid."),
})
export type GoogleAdsConsentView = z.infer<typeof googleAdsConsentViewSchema>

/**
 * Credential-free projection. zod strips unknown keys on output, so even if
 * the service ever returned `auth` or a token it could not reach the wire.
 */
export const googleAdsIntegrationResource = z.object({
  connected: z.boolean().describe("Whether a Google Ads account is connected."),
  readiness: googleAdsReadinessSchema
    .nullable()
    .describe("Null when nothing is connected."),
  customerId: z
    .string()
    .nullable()
    .describe("Connected Google Ads customer ID."),
  descriptiveName: z.string().nullable().describe("Connected account name."),
  currencyCode: z
    .string()
    .nullable()
    .describe("Connected account currency (ISO 4217)."),
  /** Null when nothing is connected. */
  uploadMethod: googleAdsUploadMethodSchema
    .nullable()
    .describe("How conversions are uploaded; null when nothing is connected."),
  acceptedCustomerDataTerms: z
    .boolean()
    .nullable()
    .describe(
      "Whether the account accepted Google's customer data terms, which hashed e-mail and phone numbers need; null when unknown or not connected.",
    ),
  consent: googleAdsConsentViewSchema.describe(
    "Conversion data consent as stored. It outlives a disconnect, so it is present even when not connected.",
  ),
  setupError: googleAdsSetupErrorSchema
    .nullable()
    .describe("Why the setup is not ready, as a code; null when fine."),
  conversionActions: z
    .array(googleAdsConversionActionResource)
    .describe(
      "Synced conversion actions; use an `id` as `conversionActionId` in a flow step or filter. Empty when not connected.",
    ),
  conversionActionsSyncedAt: z
    .date()
    .nullable()
    .describe("When the conversion actions were last synced from Google."),
})
