import type {
  GoogleAdsConsent,
  GoogleAdsConsentSource,
} from "@chatbotx.io/database/partials"
import type { GoogleAdsUploadMethod } from "@chatbotx.io/integration-google-ads"
import { z } from "zod"

export const googleAdsConsentSettings = [
  "adUserData",
  "adPersonalization",
] as const
export type GoogleAdsConsentSetting = (typeof googleAdsConsentSettings)[number]

/**
 * One setting's outcome, shaped like `googleAdsEventOptionsV1Schema.consent`
 * entries so `record()` can copy it into the event options snapshot verbatim.
 * `status: null` means the setting is omitted from the upload.
 */
const googleAdsConsentInputEntrySchema = z.object({
  status: z.enum(["granted", "denied"]).nullable(),
  source: z.enum(["notProvided", "fixed", "variable"]),
})
export const googleAdsConsentInputSchema = z.object({
  adUserData: googleAdsConsentInputEntrySchema,
  adPersonalization: googleAdsConsentInputEntrySchema,
})
export type GoogleAdsConsentInput = z.infer<typeof googleAdsConsentInputSchema>
type GoogleAdsConsentInputEntry = z.infer<
  typeof googleAdsConsentInputEntrySchema
>

/** Templates of the variable sources, keyed by setting; resolve in ONE deep call. */
export type GoogleAdsConsentTemplates = Partial<
  Record<GoogleAdsConsentSetting, string>
>
/** The same shape after variable resolution. */
export type GoogleAdsResolvedConsent = Partial<
  Record<GoogleAdsConsentSetting, string>
>

export type GoogleAdsConsentInputResult =
  | { ok: true; consent: GoogleAdsConsentInput }
  | { ok: false; setting: GoogleAdsConsentSetting }

export const consentTemplatesOf = (
  consent: GoogleAdsConsent,
): GoogleAdsConsentTemplates => {
  const templates: GoogleAdsConsentTemplates = {}
  for (const setting of googleAdsConsentSettings) {
    const source = consent[setting]
    if (source.type === "variable") {
      templates[setting] = source.template
    }
  }
  return templates
}

const UNRESOLVED_PLACEHOLDER = "{{"

const OMITTED: GoogleAdsConsentInputEntry = {
  status: null,
  source: "variable",
}

/** `undefined` = the value is neither empty nor granted/denied. */
const statusOfResolved = (
  resolved: string | undefined,
): GoogleAdsConsentInputEntry | undefined => {
  const text = (resolved ?? "").trim()
  if (text === "" || text.includes(UNRESOLVED_PLACEHOLDER)) {
    return OMITTED
  }
  const normalized = text.toLowerCase()
  if (normalized === "granted" || normalized === "denied") {
    return { status: normalized, source: "variable" }
  }
  return
}

const entryOf = (
  source: GoogleAdsConsentSource,
  resolved: string | undefined,
): GoogleAdsConsentInputEntry | undefined => {
  switch (source.type) {
    case "notProvided":
      return { status: null, source: "notProvided" }
    case "granted":
      return { status: "granted", source: "fixed" }
    case "denied":
      return { status: "denied", source: "fixed" }
    case "variable":
      return statusOfResolved(resolved)
    default:
      return
  }
}

/**
 * Maps the stored consent and its resolved variable values to what one
 * conversion records. A resolved value that is not empty/unresolved and not
 * granted/denied fails naming the setting only: the raw value never leaves.
 */
export const toConsentInput = (
  consent: GoogleAdsConsent,
  resolved: GoogleAdsResolvedConsent,
): GoogleAdsConsentInputResult => {
  const adUserData = entryOf(consent.adUserData, resolved.adUserData)
  if (!adUserData) {
    return { ok: false, setting: "adUserData" }
  }
  const adPersonalization = entryOf(
    consent.adPersonalization,
    resolved.adPersonalization,
  )
  if (!adPersonalization) {
    return { ok: false, setting: "adPersonalization" }
  }
  return { ok: true, consent: { adUserData, adPersonalization } }
}

type GoogleAdsConsentStatus = NonNullable<GoogleAdsConsentInputEntry["status"]>

/** Consent as the upload carries it; an absent key is omitted from the request. */
export type GoogleAdsTransportConsent = Partial<
  Record<GoogleAdsConsentSetting, GoogleAdsConsentStatus>
>

/** What a transport actually sends for one conversion, and what it drops. */
export type GoogleAdsConsentForTransport = {
  sent: GoogleAdsTransportConsent
  withheld: GoogleAdsTransportConsent
}

/**
 * Settings a transport cannot carry. Data Manager takes both; the legacy
 * `uploadClickConversions` only knows ad user data (ad personalization belongs
 * to other Google Ads services).
 */
const UNSUPPORTED_SETTINGS: Record<
  GoogleAdsUploadMethod,
  readonly GoogleAdsConsentSetting[]
> = {
  dataManager: [],
  legacy: ["adPersonalization"],
}

/**
 * The ONE transport filter, used by delivery and by "Validate request" so the
 * test shows exactly what a real upload would send.
 */
export const consentForTransport = (
  consent: GoogleAdsConsentInput,
  uploadMethod: GoogleAdsUploadMethod,
): GoogleAdsConsentForTransport => {
  const result: GoogleAdsConsentForTransport = { sent: {}, withheld: {} }
  for (const setting of googleAdsConsentSettings) {
    const { status } = consent[setting]
    if (status === null) {
      continue
    }
    const target = UNSUPPORTED_SETTINGS[uploadMethod].includes(setting)
      ? result.withheld
      : result.sent
    target[setting] = status
  }
  return result
}
