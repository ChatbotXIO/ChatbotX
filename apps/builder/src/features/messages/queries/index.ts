import { messageService } from "@chatbotx.io/business"
import { withMessageTranslations } from "@/features/translation/lib/message-translations"
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor-pagination"
import type {
  FindMessageRequest,
  ListMessagesRequest,
  ListMessagesResponse,
} from "../schema/query"
import type { MessageResourceWithRelations } from "../schema/resource"

/**
 * `includeTranslation` is opt-in and only for member and API readers. The guest
 * webchat history also reads through here and must never get it: an outgoing
 * message's translation holds the agent's original sentence.
 * `canSeeConversation` is the member scope of the caller: messages of a
 * conversation outside it get `translation: null` (omitted: unscoped).
 */
type TranslationOptions = {
  includeTranslation?: boolean
  canSeeConversation?: (conversationId: string) => Promise<boolean>
}

export const listMessages = async (
  input: ListMessagesRequest,
  options: TranslationOptions = {},
): Promise<ListMessagesResponse> => {
  const cursor = decodeCursor(input.cursor)

  const result = await messageService.listForConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    contactInboxId: input.contactInboxId,
    cursor: cursor
      ? {
          createdAt: cursor.createdAt,
          id: cursor.id,
          shardId: cursor.shardId,
        }
      : undefined,
    limit: input.perPage ?? 20,
  })

  const nextCursor = result.nextCursor
    ? encodeCursor({
        direction: "prev",
        createdAt: result.nextCursor.createdAt,
        id: result.nextCursor.id,
        shardId: result.nextCursor.shardId,
      })
    : null

  const data = options.includeTranslation
    ? await withMessageTranslations(input.workspaceId, result.data, {
        canSeeConversation: options.canSeeConversation,
      })
    : result.data

  return { data, nextCursor, prevCursor: null }
}

export const findMessage = async (
  input: FindMessageRequest,
  options: TranslationOptions = {},
): Promise<MessageResourceWithRelations> => {
  const message = await messageService.findByIdWithUrls({
    workspaceId: input.workspaceId,
    id: input.id,
    createdAt: input.createdAt,
  })

  if (!options.includeTranslation) {
    return message as MessageResourceWithRelations
  }
  const [withTranslation] = await withMessageTranslations(
    input.workspaceId,
    [message],
    { canSeeConversation: options.canSeeConversation },
  )
  return withTranslation as MessageResourceWithRelations
}
