import {
  type GoogleAdsConversionErrorCode,
  googleAdsConversionErrorCodes,
} from "@chatbotx.io/utils/google-click"

/**
 * Exhaustive over {@link GoogleAdsConversionErrorCode}: a new code is a compile
 * error here until it has a translation key.
 */
const googleAdsStepErrorKey = {
  google_ads_unsupported_channel:
    "googleAds.stepErrors.google_ads_unsupported_channel",
  google_ads_no_click: "googleAds.stepErrors.google_ads_no_click",
  google_ads_no_account: "googleAds.stepErrors.google_ads_no_account",
  google_ads_unknown_conversion_action:
    "googleAds.stepErrors.google_ads_unknown_conversion_action",
  google_ads_action_disabled: "googleAds.stepErrors.google_ads_action_disabled",
  google_ads_incompatible_action:
    "googleAds.stepErrors.google_ads_incompatible_action",
  google_ads_unsupported_action:
    "googleAds.stepErrors.google_ads_unsupported_action",
  google_ads_invalid_value: "googleAds.stepErrors.google_ads_invalid_value",
  google_ads_invalid_input: "googleAds.stepErrors.google_ads_invalid_input",
  google_ads_record_failed: "googleAds.stepErrors.google_ads_record_failed",
  google_ads_invalid_consent_config:
    "googleAds.stepErrors.google_ads_invalid_consent_config",
  google_ads_invalid_consent_value:
    "googleAds.stepErrors.google_ads_invalid_consent_value",
  google_ads_invalid_conversion_time:
    "googleAds.stepErrors.google_ads_invalid_conversion_time",
  google_ads_missing_dedup_id:
    "googleAds.stepErrors.google_ads_missing_dedup_id",
  google_ads_invalid_dedup_id:
    "googleAds.stepErrors.google_ads_invalid_dedup_id",
  google_ads_missing_occurrence_key:
    "googleAds.stepErrors.google_ads_missing_occurrence_key",
  google_ads_invalid_customer_property:
    "googleAds.stepErrors.google_ads_invalid_customer_property",
} as const satisfies Record<GoogleAdsConversionErrorCode, string>

/** The `ErrorLog.action` the worker writes for Google Ads (`logProviderError`'s `provider`). */
const GOOGLE_ADS_PROVIDER = "google-ads"

const knownCodes: ReadonlySet<string> = new Set(
  Object.values(googleAdsConversionErrorCodes),
)

const isKnownCode = (value: string): value is GoogleAdsConversionErrorCode =>
  knownCodes.has(value)

type StepErrorKey = (typeof googleAdsStepErrorKey)[GoogleAdsConversionErrorCode]

type Translate = {
  (key: StepErrorKey): string
  /** Method syntax keeps next-intl's narrower typed keys assignable. */
  has(key: string): boolean
}

/** `<path>: <key>` detail lines carry an i18n key from the flow-config refinements. */
const VALIDATION_LINE = /^(.+?): (googleAds\.\S+)$/

/** Translates `<path>: <googleAds.… key>`; any other line, or an unknown key, is unchanged. */
const translateDetailLine = (t: Translate, line: string): string => {
  const match = VALIDATION_LINE.exec(line)
  const path = match?.[1]
  const key = match?.[2]
  if (!(path && key && t.has(key))) {
    return line
  }
  return `${path}: ${t(key as StepErrorKey)}`
}

/**
 * Error Log description for a row. A Google Ads row whose first detail line is
 * one of our stable codes shows its translation followed by the remaining
 * lines (`<path>: <googleAds.… key>` ones translated too); every other row (other providers, free text) is returned unchanged.
 */
export const resolveErrorLogDetail = (
  t: Translate,
  action: string,
  detail: string,
): string => {
  if (action !== GOOGLE_ADS_PROVIDER) {
    return detail
  }
  const [firstLine = "", ...rest] = detail.split("\n")
  const code = firstLine.trim()
  if (!isKnownCode(code)) {
    return detail
  }
  return [
    t(googleAdsStepErrorKey[code]),
    ...rest.map((line) => translateDetailLine(t, line)),
  ].join("\n")
}
