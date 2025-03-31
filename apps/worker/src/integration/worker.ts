import {
  Gender, MessageType,
  type Prisma,
  SenderType,
  prisma
} from "@ahachat.ai/database"
import { uploader } from "@ahachat.ai/filesystem"
import type {
  OnMessageArgs,
  WhatsappAuthValue,
} from "@ahachat.ai/integration-whatsapp"
import { integration } from "@ahachat.ai/integration-whatsapp"
import type { AttachmentEntity, ConversationEntity, MessageEntity } from "@ahachat.ai/sdk"
import {
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import ky from "ky"
import { getLogger, logger } from "../lib/log"

const worker = new Worker(
  QueueName.INTEGRATION,
  async (job) => {
    const segments = job.name.split(".")
    const integrationName = segments[0] ?? ""

    if (job.name !== "whatsapp.actions.receiveMessage") {
      logger.warn("Job action is not defined", job)
    }

    const data = job.data as OnMessageArgs
    const dbIntegrationWhatsapp =
      await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          auth: {
            path: ["metadata", "phoneNumber", "id"],
            equals: data.phoneID,
          },
        },
      })

    const { message, conversation, postbackAction }: { message: MessageEntity, conversation: ConversationEntity, postbackAction: { flowVersionId: string, buttonId: string } } =
      await integration.runAction("receiveMessage", {
        ctx: {
          auth: dbIntegrationWhatsapp.auth as WhatsappAuthValue,
          logger: getLogger(integrationName),
          uploader,
        },
        data,
      })

    const { message: _newMessage, conversation: _newConversation } =
      await prisma.$transaction(async (tx) => {
        const newContact = await tx.contact.upsert({
          where: {
            chatbotId_sourceId: {
              chatbotId: dbIntegrationWhatsapp.chatbotId,
              sourceId: conversation.contact.sourceId,
            },
          },
          create: {
            sourceId: conversation.contact.sourceId,
            phoneNumber: conversation.contact.phoneNumber,
            firstName: conversation.contact.name,
            chatbotId: dbIntegrationWhatsapp.chatbotId,
            gender: Gender.UNKNOWN,
            source: integrationName,
          },
          update: {
            updatedAt: new Date(),
          },
        })

        const newConversation = await tx.conversation.upsert({
          where: {
            contactId: newContact.id,
          },
          create: {
            sourceId: conversation.sourceId,
            conversationAttributes:
              conversation.conversationAttributes as Prisma.InputJsonValue,
            inboxId: dbIntegrationWhatsapp.inboxId,
            chatbotId: dbIntegrationWhatsapp.chatbotId,
            contactId: newContact.id,
          },
          update: {
            updatedAt: new Date(),
          },
        })

        const newMessage = await tx.message.upsert({
          where: {
            chatbotId_sourceId: {
              chatbotId: dbIntegrationWhatsapp.chatbotId,
              sourceId: message.sourceId,
            },
          },
          create: {
            conversationId: newConversation.id,
            inboxId: dbIntegrationWhatsapp.inboxId,
            senderType: SenderType.CONTACT,
            chatbotId: dbIntegrationWhatsapp.chatbotId,
            senderId: newContact.id,
            messageType: MessageType.INCOMING,
            content: message.content,
            contentType: message.contentType,
            contentAttributes:
              message.contentAttributes as Prisma.InputJsonValue,
            attachments: message.attachments
              ? {
                create: message.attachments.map(
                  (attachment: AttachmentEntity) => {
                    return {
                      chatbotId: newConversation.chatbotId,
                      conversationId: newConversation.id,
                      ...attachment,
                    }
                  },
                ),
              }
              : undefined,
          },
          update: {},
        })

        // emit new message to socket
        try {
          await ky.post(
            `${process.env.PARTYSOCKET_URL}/parties/conversations/${newConversation.id}`,
            {
              headers: {
                "X-API-KEY": process.env.PARTYSOCKET_API_KEY,
              },
              json: {
                message: newMessage,
              },
            },
          )
        } catch (error) {
          logger.warn("Unable to emit realtime message", error)
        }

        return { message: newMessage, conversation: newConversation }
      })

    // if (flow) {
    // const flowVersion = await prisma.flowVersion.findFirst({
    //   where: {
    //     id: flow.flowVersionId
    //   }
    // })
    // if (!flowVersion) {
    //   return
    // }
    // todo trigger current run flow
    // Call run-flow.ts handleFlowExecution()
    // }
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
