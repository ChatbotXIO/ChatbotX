import { z } from "zod"

export const messageTranslationDirections = z.enum(["inbound", "outbound"])
export type MessageTranslationDirection = z.infer<
  typeof messageTranslationDirections
>

export const messageTranslationStatuses = z.enum([
  "translated",
  "failed",
  "skipped",
])
export type MessageTranslationStatus = z.infer<
  typeof messageTranslationStatuses
>

/** Only the reasons that are stored (an inbound job that failed its final attempt). */
export const messageTranslationFailureCodes = z.enum([
  "integrationUnavailable",
  "timeout",
  "providerError",
  "rateLimited",
  "unsafeOutput",
])
export type MessageTranslationFailureCode = z.infer<
  typeof messageTranslationFailureCodes
>

/** Stored under `Conversation.additionalAttributes.translation`. */
export type ConversationTranslationState = {
  enabledOverride?: boolean
  language?: string
  /** `auto` = detected (written only while unset); `manual` = set by an agent, never overwritten. */
  languageSource?: "auto" | "manual"
  updatedAt?: string
}
