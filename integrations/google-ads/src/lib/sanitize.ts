import { GoogleAdsException } from "../exception"
import { redactSecrets } from "./redact"

const MAX_MESSAGE_LENGTH = 1000

export type SanitizedGoogleAdsError = {
  message: string
  httpCode: string
  reason: string | undefined
}

/**
 * The only form of a Google Ads failure that may be logged or persisted:
 * credentials, key material and the click ids of this request are scrubbed,
 * even when Google echoes them back inside an error detail.
 */
export const sanitizeGoogleAdsError = (
  error: unknown,
  options: { secrets?: readonly string[] } = {},
): SanitizedGoogleAdsError => {
  const raw = error instanceof Error ? error.message : String(error)
  const message = redactSecrets(raw, options.secrets)
  const isGoogle = error instanceof GoogleAdsException
  return {
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    httpCode: isGoogle ? String(error.httpStatusCode) : "500",
    reason: isGoogle ? error.reason : undefined,
  }
}
