"use server"

import { db } from "@aha.chat/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@aha.chat/database/schema"
import type { BroadcastModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
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

      const data: BroadcastModel = {
        ...parsedInput,
        name: flow.name,
        chatbotId,
        status: "scheduled",
        schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
        id: createId(),
      }
      if (data.schedulesType === "now" || data.schedulesAt <= new Date()) {
        data.status = "sent"
      }

      // Calculate contacts to send broadcast
      const contacts = await db.query.contactModel.findMany({
        columns: {
          id: true,
        },
        where: {
          chatbotId,
        },
      })

      const newBroadcast = await db.transaction(async (tx) => {
        const newBroadcast = await tx
          .insert(broadcastModel)
          .values(data)
          .returning()
          .then((result) => result[0])

        await tx.insert(contactsOnBroadcastsModel).values(
          contacts.map((contact) => ({
            broadcastId: newBroadcast.id,
            contactId: contact.id,
          })),
        )
        return newBroadcast
      })

      if (newBroadcast.status === "sent") {
        await integrationQueue.add(IntegrationJobAction.sendBroadcast, {
          type: IntegrationJobAction.sendBroadcast,
          data: {
            broadcastId: newBroadcast.id,
          },
        })
      }

      revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
    },
  )
