import {
  conversationParticipantRepository,
  type ListRepliedInput,
  type RecordReplyInput,
} from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { logger } from "../logger"

class ConversationParticipantService extends BaseService {
  /**
   * Records that a workspace member replied in a conversation. Idempotent and
   * monotonic: a retry, a duplicate or an older `at` changes nothing. Never
   * rejects — the message is already sent, so a failure here is logged and
   * must not fail the send.
   */
  async recordReply(input: RecordReplyInput): Promise<void> {
    try {
      await conversationParticipantRepository.upsertReply(input)
    } catch (err) {
      logger.error(
        { err, conversationId: input.conversationId, userId: input.userId },
        "conversationParticipantService.recordReply failed",
      )
    }
  }

  /** Members who replied, newest first (keyset-paginated). */
  listReplied(input: ListRepliedInput) {
    return conversationParticipantRepository.listRepliedByConversation(input)
  }
}

export const conversationParticipantService =
  new ConversationParticipantService()
