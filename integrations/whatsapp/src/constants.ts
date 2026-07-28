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
