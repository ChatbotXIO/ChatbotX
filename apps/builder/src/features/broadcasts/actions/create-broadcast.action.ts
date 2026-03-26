"use server"

import { db } from "@aha.chat/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "../schemas/action"
export const createBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createBroadcastRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateBroadcastRequest
    }) => {
      let broadcastName = "Broadcast"

      // Validate flow if flowId is provided
      if (parsedInput.flowId) {
        const flow = await db.query.flowModel.findFirst({
          where: {
            chatbotId,
            id: parsedInput.flowId,
          },
        })
        if (!flow) {
          return returnValidationErrors(createBroadcastRequest, {
            _errors: ["Validation Exception"],
            flowId: {
              _errors: ["Flow not found"],
            },
          })
        }
        broadcastName = flow.name
      }

      if (parsedInput.templateId) {
        const template = await db.query.whatsappMessageTemplateModel.findFirst({
          where: {
            id: parsedInput.templateId,
            integrationWhatsapp: {
              chatbotId,
              id: parsedInput.integrationWhatsappId,
            },
          },
        })
        if (!template) {
          return returnValidationErrors(createBroadcastRequest, {
            _errors: ["Validation Exception"],
            templateId: {
              _errors: ["Template not found"],
            },
          })
        }
        broadcastName = template.name
      }

      let inboxId: string | undefined
      if (parsedInput.integrationWhatsappId) {
        const integrationWhatsapp =
          await db.query.integrationWhatsappModel.findFirst({
            where: {
              chatbotId,
              id: parsedInput.integrationWhatsappId,
            },
          })
        if (integrationWhatsapp) {
          inboxId = integrationWhatsapp.inboxId
        }
      }

      const data: typeof broadcastModel.$inferInsert = {
        ...parsedInput,
        name: broadcastName,
        chatbotId,
        status: "scheduled",
        schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
        templateData: parsedInput.templateData ?? "{}",
        id: createId(),
      }

      const contacts = await db.query.contactModel.findMany({
        columns: { id: true },
        where: {
          chatbotId,
          ...(inboxId && {
            conversation: {
              inboxId,
            },
          }),
        },
      })

      await db.transaction(async (tx) => {
        const newBroadcast = await tx
          .insert(broadcastModel)
          .values(data)
          .returning()
          .then((result) => result[0])

        if (contacts.length > 0) {
          await tx.insert(contactsOnBroadcastsModel).values(
            contacts.map((contact) => ({
              broadcastId: newBroadcast.id,
              contactId: contact.id,
            })),
          )
        }
        return newBroadcast
      })

      revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
    },
  )
