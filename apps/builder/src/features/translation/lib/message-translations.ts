import {
  inboxTranslationSettingsService,
  translationService,
} from "@chatbotx.io/business"
import type { MessageTranslationModel } from "@chatbotx.io/database/types"
import type { MessageTranslationResource } from "../schema/resource"

/** A stored row as the inbox, `messages.list` and a translated send return it. */
export const toMessageTranslationResource = (
  row: MessageTranslationModel,
): NonNullable<MessageTranslationResource> => ({
  direction: row.direction,
  status: row.status,
  displayText: row.displayText,
  sourceLanguage: row.sourceLanguage,
  targetLanguage: row.targetLanguage,
  failureCode: row.failureCode,
})

/**
 * Adds a `translation` field (`null` when the message has none) to messages a
 * member or an API caller reads.
 *
 * Only for those readers: an outgoing message's `displayText` is the agent's
 * own sentence, so the guest webchat history must never call this. A workspace
 * that never switched translation on costs no query at all (the settings read
 * is cached), because `listMessages` runs on every conversation open.
 *
 * `canSeeConversation` is the caller's member scope (see
 * `conversationAccessCheckForCaller`): a message of a conversation outside it
 * gets `translation: null`, so a member limited to assigned conversations
 * never reads an agent's original sentence elsewhere. Omitted: unscoped.
 */
export async function withMessageTranslations<
  TMessage extends { id: string; conversationId?: string | null },
>(
  workspaceId: string,
  messages: TMessage[],
  options: {
    canSeeConversation?: (conversationId: string) => Promise<boolean>
  } = {},
): Promise<(TMessage & { translation: MessageTranslationResource })[]> {
  const withoutTranslation = () =>
    messages.map((message) => ({ ...message, translation: null }))
  if (
    messages.length === 0 ||
    !(await inboxTranslationSettingsService.hasEverBeenEnabled(workspaceId))
  ) {
    return withoutTranslation()
  }

  const { canSeeConversation } = options
  const visible = canSeeConversation
    ? await Promise.all(
        messages.map((message) =>
          message.conversationId
            ? canSeeConversation(message.conversationId)
            : false,
        ),
      )
    : messages.map(() => true)
  const visibleIds = messages.flatMap((message, index) =>
    visible[index] ? [message.id] : [],
  )
  if (visibleIds.length === 0) {
    return withoutTranslation()
  }

  const rows = await translationService.findTranslations(
    workspaceId,
    visibleIds,
  )
  const byMessageId = new Map(rows.map((row) => [row.messageId, row]))
  return messages.map((message, index) => {
    const row = visible[index] ? byMessageId.get(message.id) : undefined
    return {
      ...message,
      translation: row ? toMessageTranslationResource(row) : null,
    }
  })
}
