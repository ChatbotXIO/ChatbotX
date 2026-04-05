"use server"

import { db } from "@chatbotx.io/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBroadcastRequest } from "../schemas/action"
export const createBroadcastAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createBroadcastRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    let broadcastName = "Broadcast"

    // Validate flow if flowId is provided
    if (parsedInput.flowId) {
      const flow = await db.query.flowModel.findFirst({
        where: {
          workspaceId,
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
            workspaceId,
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
            workspaceId,
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
      workspaceId,
      status: "scheduled",
      schedulesAt: new Date(parsedInput.schedulesAt ?? new Date()),
      templateData: parsedInput.templateData ?? "{}",
    }

    const contacts = await db.query.contactModel.findMany({
      columns: { id: true },
      where: {
        workspaceId,
        ...(inboxId && {
          contactInboxes: {
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

    revalidateCacheTags(`workspaces:${workspaceId}#broadcasts`)
  })
