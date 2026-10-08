import type { RecordConversionInput } from "@chatbotx.io/business"
import {
  consentTemplatesOf,
  type GoogleAdsConsentSetting,
  googleAdsSettingsService,
  toConsentInput,
} from "@chatbotx.io/business"
import type { GoogleAdsIdentityPolicy } from "@chatbotx.io/database/partials"
import type { GoogleAdsConversionErrorCode } from "@chatbotx.io/utils/google-click"
import { googleAdsConversionErrorCodes } from "@chatbotx.io/utils/google-click"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import type { ResolvedGoogleAdsFields } from "./google-ads-input-error"

type VariableSource = Parameters<typeof resolveContactVariablesDeep>[2]

export type GoogleAdsConversionFieldTemplates = {
  value?: string
  currency?: string
  dedupMode: GoogleAdsIdentityPolicy
  dedupId?: string
  conversionTime?: string
  customerType?: string
  customerValueBucket?: string
}

type ResolvedConversionInputs = {
  dedupMode: GoogleAdsIdentityPolicy
  /** What the templates produced; the only fields the Error Log may print. */
  fields: ResolvedGoogleAdsFields
  /** The fields both producers hand to `record` unchanged; each adds its own source, scope and key. */
  recordFields: Pick<
    RecordConversionInput,
    | "value"
    | "currency"
    | "recordedAt"
    | "dedupMode"
    | "dedupId"
    | "conversionTime"
    | "consent"
    | "customerType"
    | "customerValueBucket"
  >
}

export type ResolveConversionInputsResult =
  | { ok: true; inputs: ResolvedConversionInputs }
  | {
      ok: false
      code: Extract<
        GoogleAdsConversionErrorCode,
        "google_ads_invalid_consent_config" | "google_ads_invalid_consent_value"
      >
      /** Set for an invalid consent value: names the setting, never the value. */
      setting?: GoogleAdsConsentSetting
    }

/**
 * Shared by both producers (flow step, trigger action): loads the workspace
 * consent and resolves every `{{variable}}` template in ONE deep call (one
 * contact-variable load), so the step fields and the consent templates see the
 * same contact data. A saved consent that cannot be read, or a resolved value
 * that is neither granted nor denied, records nothing.
 */
export const resolveGoogleAdsConversionInputs = async (input: {
  workspaceId: string
  contactId: string
  fields: GoogleAdsConversionFieldTemplates
  source: VariableSource
}): Promise<ResolveConversionInputsResult> => {
  const recordedAt = new Date()
  const stored = await googleAdsSettingsService.getConsent(input.workspaceId)
  if (stored.status === "invalid") {
    return {
      ok: false,
      code: googleAdsConversionErrorCodes.invalidConsentConfig,
    }
  }
  const { dedupMode, ...templates } = input.fields
  const resolved = await resolveContactVariablesDeep(
    input.contactId,
    { ...templates, consent: consentTemplatesOf(stored.consent) },
    input.source,
  )
  const { consent: resolvedConsent, ...fields } = resolved
  const consent = toConsentInput(stored.consent, resolvedConsent)
  if (!consent.ok) {
    return {
      ok: false,
      code: googleAdsConversionErrorCodes.invalidConsentValue,
      setting: consent.setting,
    }
  }
  return {
    ok: true,
    inputs: {
      dedupMode,
      fields,
      recordFields: {
        value: fields.value,
        currency: fields.currency,
        recordedAt,
        dedupMode,
        dedupId: fields.dedupId,
        conversionTime: fields.conversionTime,
        consent: consent.consent,
        customerType: fields.customerType,
        customerValueBucket: fields.customerValueBucket,
      },
    },
  }
}
