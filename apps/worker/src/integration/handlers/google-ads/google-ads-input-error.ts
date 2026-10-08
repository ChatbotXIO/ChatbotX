import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  type GoogleAdsConversionErrorCode,
  googleAdsConversionErrorCodes,
} from "@chatbotx.io/utils/google-click"
import type { z } from "zod"

/** What the step templates resolved to; the only values an Error Log line may print. */
export type ResolvedGoogleAdsFields = {
  value?: string
  currency?: string
  dedupId?: string
  conversionTime?: string
  customerType?: string
  customerValueBucket?: string
}

/**
 * The fields an Error Log line may print. An explicit list rather than every
 * key of the object: a type does not stop an extra runtime key (an identifier
 * a later feature resolves) from being printed.
 */
const PRINTABLE_FIELDS = [
  "value",
  "currency",
  "dedupId",
  "conversionTime",
  "customerType",
  "customerValueBucket",
] as const satisfies readonly (keyof ResolvedGoogleAdsFields)[]

/**
 * The customer properties accept a `{{variable}}`, which could have been mapped
 * to a personal field (a name, a place) by mistake, so their resolved values are
 * never echoed: the line names the field and the allowed values live in the docs.
 */
const WITHHELD = "[withheld]"
const WITHHELD_FIELDS: ReadonlySet<string> = new Set([
  "customerType",
  "customerValueBucket",
])
const printable = (field: string, fieldValue: string) =>
  WITHHELD_FIELDS.has(field) ? WITHHELD : fieldValue

/**
 * Record refusals caused by the workspace's configuration or data (not by the
 * contact or the account), so they reach the Error Log as well as the step's
 * error branch.
 */
export const configRefusalCodes = {
  invalidValue: googleAdsConversionErrorCodes.invalidValue,
  missingDedupId: googleAdsConversionErrorCodes.missingDedupId,
  invalidDedupId: googleAdsConversionErrorCodes.invalidDedupId,
  invalidConversionTime: googleAdsConversionErrorCodes.invalidConversionTime,
  invalidCustomerProperty:
    googleAdsConversionErrorCodes.invalidCustomerProperty,
} as const

export const isConfigRefusal = (
  status: string,
): status is keyof typeof configRefusalCodes => status in configRefusalCodes

/**
 * One plain `path: message` line per zod issue. The message may be an i18n key
 * (the flow-config refinements), which the builder translates per line, so no
 * decorative symbols are added the way `z.prettifyError` would.
 */
const describeIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.map(String).join(".")
    return path ? `${path}: ${issue.message}` : issue.message
  })

/**
 * Human-readable summary for the workspace Error Log: the validation
 * message (when there is one) plus the resolved values the templates
 * produced. Never includes a click id.
 */
export function describeGoogleAdsInputFailure(
  code: GoogleAdsConversionErrorCode,
  resolved: ResolvedGoogleAdsFields = {},
  error?: z.ZodError,
): string {
  const lines: string[] = [code]
  if (error) {
    lines.push(...describeIssues(error))
  }
  const entries = PRINTABLE_FIELDS.flatMap((field) => {
    const fieldValue = resolved[field]
    return typeof fieldValue === "string" && fieldValue.length > 0
      ? [[field, printable(field, fieldValue)] as const]
      : []
  })
  if (entries.length > 0) {
    lines.push(
      `Resolved: ${entries
        .map(([field, fieldValue]) => `${field}=${JSON.stringify(fieldValue)}`)
        .join(", ")}`,
    )
  }
  return lines.join("\n")
}

/**
 * Error Log text for a consent failure: the code, then the setting's name for
 * an invalid value. The resolved value itself is never printed (it is contact
 * data), and consent never goes through {@link describeGoogleAdsInputFailure}.
 */
export function describeGoogleAdsConsentFailure(
  code: GoogleAdsConversionErrorCode,
  setting?: string,
): string {
  return setting ? `${code}\nSetting: ${setting}` : code
}

/**
 * Surfaces a Google Ads configuration/template failure in the workspace
 * Error Log. Never throws (`logProviderError` swallows).
 */
export async function reportGoogleAdsInputFailure(input: {
  workspaceId: string
  contactId?: string | null
  /** The contact's channel-side id (`ContactInbox.sourceId`). */
  sourceId?: string | null
  message: string
}): Promise<void> {
  await logProviderError({
    provider: "google-ads",
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    sourceId: input.sourceId,
    error: new Error(input.message),
    httpCode: null,
  })
}
