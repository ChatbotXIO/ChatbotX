export const DEFAULT_API_VERSION = "v23.0"

export const API_URL = "https://graph.facebook.com"

export const BUSINESS_URL = "https://business.facebook.com"

export const WHATSAPP_FLOW_MESSAGE_VERSION = "3"

/**
 * How Meta may deliver a phone-number verification code.
 *
 * Kept in this dependency-free module rather than beside `requestVerificationCode`
 * so the builder's client components can derive their form schema from it without
 * pulling the Graph HTTP client into the browser bundle.
 */
export const WHATSAPP_VERIFICATION_CODE_METHODS = {
  SMS: "SMS",
  VOICE: "VOICE",
} as const

export type WhatsappVerificationCodeMethod =
  (typeof WHATSAPP_VERIFICATION_CODE_METHODS)[keyof typeof WHATSAPP_VERIFICATION_CODE_METHODS]

export const DEFAULT_WHATSAPP_VERIFICATION_LANGUAGE = "en_US"

/**
 * Meta's calling-eligibility errors. Meta returns all three as an
 * `OAuthException`, which reads as a credential problem unless matched on the
 * code first — the token is fine, the account or the app subscription is not.
 * Each is `is_transient: false`, so none of them clears on a retry.
 *
 * Kept in this dependency-free module so the error mapper and the builder's
 * calling surfaces share one definition instead of each repeating the numbers.
 */
export const WHATSAPP_CALLING_ERROR_CODES = {
  /** The account may not place business-initiated calls (country/eligibility). */
  BUSINESS_CALLING_UNAVAILABLE: 138_013,
  /** Calling is not enabled for this phone number. */
  CALLING_NOT_ENABLED: 138_014,
  /** The owning app is not subscribed to the calls webhook field. */
  CALLS_WEBHOOK_NOT_SUBSCRIBED: 138_018,
} as const

export type WhatsappCallingErrorCode =
  (typeof WHATSAPP_CALLING_ERROR_CODES)[keyof typeof WHATSAPP_CALLING_ERROR_CODES]
