/**
 * Meta-native call recording/transcription opt-in helpers. VoIP-only: SIP-
 * enabled numbers cannot use these.
 */
import { WhatsappException } from "../exception"

/** Meta's `purpose` field cap on the `recording`/`transcription` objects. */
export const MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS = 250

/**
 * Meta's supported `announcement_language` codes for the
 * `recording`/`transcription` objects on `POST /calls` — a mixed set of bare-
 * language and region-qualified codes; do NOT derive this by transforming a
 * locale tag.
 */
export const SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES = [
  "en",
  "en_US",
  "en_AU",
  "en_CA",
  "en_GB",
  "en_IN",
  "en_NZ",
  "nl",
  "fr",
  "de",
  "hi",
  "it",
  "kn",
  "pt",
  "es",
  "es_ES",
  "te",
  "vi",
] as const

export type WhatsappCallAnnouncementLanguage =
  (typeof SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES)[number]

const DEFAULT_ANNOUNCEMENT_LANGUAGE: WhatsappCallAnnouncementLanguage = "en_US"

const SUPPORTED_ANNOUNCEMENT_LANGUAGE_SET = new Set<string>(
  SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES,
)

/**
 * Falls back to `en_US` on no match, never throws. A contact's locale is
 * often region-tagged (`vi_VN`) while Meta lists many languages bare (`vi`),
 * so this normalizes `-` to `_`, tries an exact match, then falls back to the
 * base language (`vi_VN` -> `vi`).
 */
export const resolveAnnouncementLanguage = (
  input: string | undefined,
): WhatsappCallAnnouncementLanguage => {
  if (!input) {
    return DEFAULT_ANNOUNCEMENT_LANGUAGE
  }
  const normalized = input.replace("-", "_")
  if (SUPPORTED_ANNOUNCEMENT_LANGUAGE_SET.has(normalized)) {
    return normalized as WhatsappCallAnnouncementLanguage
  }
  const baseLanguage = normalized.split("_")[0]
  if (baseLanguage && SUPPORTED_ANNOUNCEMENT_LANGUAGE_SET.has(baseLanguage)) {
    return baseLanguage as WhatsappCallAnnouncementLanguage
  }
  return DEFAULT_ANNOUNCEMENT_LANGUAGE
}

/** Caller-facing input for the `recording`/`transcription` opt-in objects. */
export type WhatsappCallAnnouncementInput = {
  status: "ENABLED"
  /** Meta requires this when `status` is ENABLED. Max 250 chars. */
  purpose: string
  announcementLanguage: string
}

/** Meta's snake_case wire shape for the `recording`/`transcription` objects. */
export type WhatsappCallAnnouncementBody = {
  status: "ENABLED"
  purpose: string
  announcement_language: string
}

/**
 * Validates `purpose` length and serializes a caller-supplied announcement
 * input into Meta's snake_case wire shape. Throws a typed error (via
 * `onPurposeTooLong`) rather than silently truncating — a bad `purpose` would
 * otherwise make Meta reject the whole `connect`/`accept` call at request time.
 */
export const buildCallAnnouncementBody = (
  input: WhatsappCallAnnouncementInput,
): WhatsappCallAnnouncementBody => {
  if (input.purpose.length > MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS) {
    throw new WhatsappException(
      `WhatsApp call announcement "purpose" exceeds ${MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS} characters (got ${input.purpose.length})`,
      400,
      "whatsappCallAnnouncementPurposeTooLong",
    )
  }

  return {
    status: input.status,
    purpose: input.purpose,
    announcement_language: resolveAnnouncementLanguage(
      input.announcementLanguage,
    ),
  }
}
