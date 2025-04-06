import { prisma } from "@ahachat.ai/database"
import type { ConversationEntity, MessageEntity } from "@ahachat.ai/sdk"
import {
  ChatQueueAction,
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import { getLogger, logger } from "../lib/log"
import { getIntegrationAuth } from "./handlers/integration.query"
import { allIntegrations } from "../shared/integrations"

const worker = new Worker(
  QueueName.CHAT,
  async (job) => {
    if (job.name === ChatQueueAction.SEND_MESSAGE) {
      const { conversation, message } = job.data as {
        conversation: ConversationEntity
        message: MessageEntity
      }

      // Find integration auth
      const inbox = await prisma.inbox.findFirstOrThrow({
        where: { id: conversation.inboxId },
        include: {
          integrationWhatsapp: true,
          chatbot: true,
        },
      })
      const integrationAuth = await getIntegrationAuth(inbox)
      if (!integrationAuth) {
        logger.error("Unable to find integration auth:", inbox.inboxType)
        return
      }

      // Find integration detail
      const intergationDetail = allIntegrations[inbox.inboxType]
      if (!intergationDetail) {
        logger.error("Unable to find integration detail:", inbox.inboxType)
        return
      }

      await intergationDetail.runAction("sendMessage", {
        ctx: {
          chatbot: inbox.chatbot,
          auth: integrationAuth,
          logger: getLogger(inbox.inboxType),
        },
        conversation,
        message,
      })
    }
  },
  {
    connection,
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
