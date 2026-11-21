import { z } from "zod"

/**
 * Why a translation could not be made. Public API errors carry these as
 * `ChatbotXException.code` (`translation<Name>`); a send with `translate: true`
 * that cannot be translated is not sent and fails with `translationNotSent`,
 * whose `data.reason` is one of these.
 */
export const translationApiErrorCodes = z.enum([
  "disabled",
  "notConfigured",
  "integrationUnavailable",
  "unknownLanguage",
  "timeout",
  "providerError",
  "emptyOutput",
  "rateLimited",
  "unsafeOutput",
  "tooLong",
])
export type TranslationApiErrorCode = z.infer<typeof translationApiErrorCodes>

export const TRANSLATION_API_ERRORS = {
  disabled: {
    code: "translationDisabled",
    status: 422,
    message:
      "Translation is turned off for this workspace or conversation, or switched off by the operator.",
  },
  notConfigured: {
    code: "translationNotConfigured",
    status: 422,
    message: "Choose an AI integration and model for translation first.",
  },
  integrationUnavailable: {
    code: "translationIntegrationUnavailable",
    status: 422,
    message:
      "The AI integration chosen for translation is missing, disabled or its credentials are invalid.",
  },
  unknownLanguage: {
    code: "translationUnknownLanguage",
    status: 422,
    message:
      "The customer's language is not known yet. Set it with `translation.updateConversationState`, or wait until a customer message has been translated.",
  },
  timeout: {
    code: "translationTimeout",
    status: 504,
    message: "The AI model did not answer in time.",
  },
  providerError: {
    code: "translationProviderError",
    status: 502,
    message: "The AI provider failed to translate the text.",
  },
  emptyOutput: {
    code: "translationEmptyOutput",
    status: 502,
    message: "The AI model returned no translation.",
  },
  rateLimited: {
    code: "translationRateLimited",
    status: 429,
    message: "The AI provider is rate limiting translation requests.",
  },
  unsafeOutput: {
    code: "translationUnsafeOutput",
    status: 422,
    message:
      "The translation changed protected content (links, variables, code) and was discarded.",
  },
  tooLong: {
    code: "translationTooLong",
    status: 422,
    message: "The translation is longer than the channel accepts.",
  },
} as const satisfies Record<
  TranslationApiErrorCode,
  { code: string; status: number; message: string }
>

/**
 * Failures that come from the AI provider's API itself (bad credentials, a
 * missing integration, a provider error). Sending then turns translation off
 * for the conversation, so the agent's next message goes out as written. A
 * timeout, a rate limit or an unusable answer only fails that one message.
 */
export const TRANSLATION_PROVIDER_FAILURE_CODES: ReadonlySet<TranslationApiErrorCode> =
  new Set<TranslationApiErrorCode>(["integrationUnavailable", "providerError"])

/** A send with `translate: true` whose text could not be translated: nothing was sent. */
export const TRANSLATION_NOT_SENT_CODE = "translationNotSent"

export const translationNotSentDataSchema = z.object({
  reason: translationApiErrorCodes.describe(
    "Why the text could not be translated (`timeout`, `providerError`, `rateLimited`, ...).",
  ),
  conversationTranslation: z
    .enum(["on", "off"])
    .describe(
      "`off`: the AI provider failed, so translation was turned off for this conversation and the next send goes out as written (turn it back on with `translation.updateConversationState`). `on`: nothing changed; send again to try again.",
    ),
})
export type TranslationNotSentData = z.infer<
  typeof translationNotSentDataSchema
>

export const TRANSLATION_NOT_SENT_ERROR = {
  message:
    "The message was not sent because it could not be translated. `data.reason` says why.",
  status: 422,
  data: translationNotSentDataSchema,
}
