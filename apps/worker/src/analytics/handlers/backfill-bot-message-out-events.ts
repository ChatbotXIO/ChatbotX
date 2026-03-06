import { contactTrackingService } from "@aha.chat/analytics"
import { and, db, eq } from "@aha.chat/database/client"
import {
  contactModel,
  conversationModel,
  inboxModel,
  messageModel,
} from "@aha.chat/database/schema"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 1000

export const backfillBotMessageOutEvents = async () => {
  logger.info("Starting backfill of bot outgoing message events to ClickHouse")

  const chatbots = await db.query.chatbotModel.findMany({
    columns: { id: true },
  })

  for (const chatbot of chatbots) {
    let offset = 0
    let processedCount = 0

    while (true) {
      const messages = await db
        .select({
          id: messageModel.id,
          chatbotId: messageModel.chatbotId,
          createdAt: messageModel.createdAt,
          contactSourceId: contactModel.sourceId,
          contactSource: contactModel.source,
          inboxType: inboxModel.inboxType,
        })
        .from(messageModel)
        .innerJoin(
          conversationModel,
          eq(messageModel.conversationId, conversationModel.id),
        )
        .innerJoin(
          contactModel,
          eq(conversationModel.contactId, contactModel.id),
        )
        .innerJoin(inboxModel, eq(messageModel.inboxId, inboxModel.id))
        .where(
          and(
            eq(messageModel.chatbotId, chatbot.id),
            eq(messageModel.messageType, "outgoing"),
            eq(messageModel.senderType, "bot"),
          ),
        )
        .orderBy(messageModel.createdAt)
        .limit(BATCH_SIZE)
        .offset(offset)

      if (messages.length === 0) {
        break
      }

      const events = messages
        .filter((msg) => Boolean(msg.contactSourceId))
        .map((msg) => ({
          chatbotId: msg.chatbotId,
          contactId: msg.contactSourceId as string,
          eventType: "contact_message_out" as const,
          senderType: "bot" as const,
          occurredAt: msg.createdAt,
          source: msg.contactSource || "",
          sourceId: msg.contactSourceId as string,
          channel: msg.inboxType || "",
        }))

      try {
        await contactTrackingService.trackEvents(events)
        processedCount += messages.length
        logger.info(
          `Backfilled ${processedCount} bot outgoing messages for chatbot ${chatbot.id}`,
        )
      } catch (error) {
        logger.error(
          error,
          `Failed to backfill bot messages for chatbot ${chatbot.id}`,
        )
      }

      offset += BATCH_SIZE
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    logger.info(
      `Completed bot message backfill for chatbot ${chatbot.id}: ${processedCount} messages`,
    )
  }

  logger.info("Bot message backfill completed for all chatbots")
}
