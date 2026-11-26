import { z } from "zod"

/**
 * Why a requested message is not queued for translation. Its own module
 * (`@chatbotx.io/business/translation/skip-reasons`) so the builder's response
 * schema reuses it without pulling in the Redis-backed request guard.
 */
export const translationSkipReasons = z.enum([
  "notFound",
  "notDirectText",
  "notInbound",
  "noise",
  "alreadyTranslated",
  "failed",
  "inFlight",
  "disabled",
  "unavailable",
])
export type TranslationSkipReason = z.infer<typeof translationSkipReasons>
