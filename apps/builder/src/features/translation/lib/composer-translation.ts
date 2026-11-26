import { isSameLanguage } from "@chatbotx.io/business/translation/language-policy"

/** What the composer's language chip shows, and whether a send will be translated. */
export type ComposerTranslationState =
  /** Nothing is shown: translation off for the workspace, or a comment/private reply. */
  | { kind: "hidden" }
  /** Turned off for this conversation. */
  | { kind: "off" }
  | { kind: "unknownLanguage" }
  | { kind: "sameLanguage"; language: string }
  | { kind: "hasFiles"; language: string | null }
  | { kind: "active"; language: string }

export function resolveComposerTranslation(input: {
  workspaceEnabled: boolean
  conversationEnabled: boolean
  language: string | null
  workspaceLanguage: string | null
  hasFiles: boolean
  isCommentOrPrivateReply: boolean
}): ComposerTranslationState {
  if (!input.workspaceEnabled || input.isCommentOrPrivateReply) {
    return { kind: "hidden" }
  }
  if (!input.conversationEnabled) {
    return { kind: "off" }
  }
  if (input.hasFiles) {
    return { kind: "hasFiles", language: input.language }
  }
  if (!input.language) {
    return { kind: "unknownLanguage" }
  }
  if (isSameLanguage(input.language, input.workspaceLanguage)) {
    return { kind: "sameLanguage", language: input.language }
  }
  return { kind: "active", language: input.language }
}

/** The sent message is translated only when the chip is in the `active` state. */
export const willTranslateSend = (state: ComposerTranslationState): boolean =>
  state.kind === "active"
