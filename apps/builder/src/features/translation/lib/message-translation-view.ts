import { isSameLanguage } from "@chatbotx.io/business/translation/language-policy"
import { isNoiseText } from "@chatbotx.io/business/translation/noise-filter"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

/** What the bubble shows for a message's translation. */
export type MessageTranslationView =
  | { kind: "none" }
  /** Asked for, no answer yet (under 30 s). */
  | { kind: "pending" }
  /** Asked for, no answer for 30 s: neutral, not an error. */
  | { kind: "waiting" }
  | { kind: "failed" }
  | {
      kind: "translated"
      direction: "inbound" | "outbound"
      /** Shown first: the translation (inbound) or what the agent typed (outbound). */
      mainText: string
      /** Shown below: the customer's original (inbound) or what was sent (outbound). */
      secondaryText: string
      /** Language of the secondary text. */
      languageCode: string | null
    }

type ViewMessage = Pick<
  MessageResourceWithRelations,
  "messageType" | "type" | "contentType" | "text" | "deletedAt" | "translation"
>

/**
 * Pure decision behind the bubble's translation block, so every state of the
 * UI table is testable without rendering. `requestState` is the local
 * "asked for it" state; it only matters while there is no fresh translation.
 */
export function resolveMessageTranslationView(input: {
  message: ViewMessage
  /** Translation applies to this conversation (workspace on, no override). */
  enabled: boolean
  workspaceLanguage: string | null
  requestState?: "pending" | "waiting"
}): MessageTranslationView {
  const { message, enabled, workspaceLanguage, requestState } = input
  if (
    !enabled ||
    message.type !== "message" ||
    message.contentType !== "text" ||
    message.deletedAt ||
    !message.text
  ) {
    return { kind: "none" }
  }

  const translation = message.translation ?? null

  if (message.messageType === "outgoing") {
    return translation?.direction === "outbound" &&
      translation.status === "translated" &&
      translation.displayText
      ? {
          kind: "translated",
          direction: "outbound",
          mainText: translation.displayText,
          secondaryText: message.text,
          languageCode: translation.targetLanguage,
        }
      : { kind: "none" }
  }
  if (message.messageType !== "incoming" || isNoiseText(message.text)) {
    return { kind: "none" }
  }

  // A row written for another workspace language is stale: its translation is
  // into the wrong language, so it is hidden and asked for again.
  const isStale =
    translation !== null &&
    workspaceLanguage !== null &&
    !isSameLanguage(translation.targetLanguage, workspaceLanguage)

  if (translation && !isStale) {
    if (translation.status === "translated" && translation.displayText) {
      return {
        kind: "translated",
        direction: "inbound",
        mainText: translation.displayText,
        secondaryText: message.text,
        languageCode: translation.sourceLanguage,
      }
    }
    if (translation.status === "failed") {
      // A retry in progress shows as translating, not as the old failure.
      return requestState ? { kind: requestState } : { kind: "failed" }
    }
    return { kind: "none" }
  }
  return requestState ? { kind: requestState } : { kind: "none" }
}

/**
 * Whether the inbox should ask for this message to be translated now: an
 * inbound direct text that is not noise and has no usable row (none, or stale).
 * A `failed` or `skipped` row is not asked for again on its own.
 */
export function needsTranslationRequest(input: {
  message: ViewMessage & { id: string }
  workspaceLanguage: string | null
}): boolean {
  const { message, workspaceLanguage } = input
  if (
    message.messageType !== "incoming" ||
    message.type !== "message" ||
    message.contentType !== "text" ||
    message.deletedAt ||
    !message.text ||
    isNoiseText(message.text)
  ) {
    return false
  }
  const translation = message.translation ?? null
  if (!translation) {
    return true
  }
  return (
    translation.direction === "inbound" &&
    workspaceLanguage !== null &&
    !isSameLanguage(translation.targetLanguage, workspaceLanguage)
  )
}
