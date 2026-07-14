"use server"

import { db } from "@chatbotx.io/database/client"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { startOfMinute } from "date-fns"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
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

    // Never trust integration ids from the client: they scope the audience,
    // so a foreign id would let a broadcast target another workspace's pages.
    if (parsedInput.integrationMessengerId) {
      const integration = await db.query.integrationMessengerModel.findFirst({
        where: {
          id: parsedInput.integrationMessengerId,
          workspaceId,
        },
        columns: { id: true },
      })
      if (!integration) {
        return returnValidationErrors(createBroadcastRequest, {
          _errors: ["Validation Exception"],
          integrationMessengerId: {
            _errors: ["Integration not found"],
          },
        })
      }
    }

    if (parsedInput.integrationWhatsappId) {
      const integration = await db.query.integrationWhatsappModel.findFirst({
        where: {
          id: parsedInput.integrationWhatsappId,
          workspaceId,
        },
        columns: { id: true },
      })
      if (!integration) {
        return returnValidationErrors(createBroadcastRequest, {
          _errors: ["Validation Exception"],
          integrationWhatsappId: {
            _errors: ["Integration not found"],
          },
        })
      }
    }

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
      if (parsedInput.channel === "messenger") {
        const template = await db.query.messengerMessageTemplateModel.findFirst(
          {
            where: {
              id: parsedInput.templateId,
              integrationMessengerId: parsedInput.integrationMessengerId,
              integrationMessenger: { workspaceId },
            },
          },
        )
        if (!template) {
          return returnValidationErrors(createBroadcastRequest, {
            _errors: ["Validation Exception"],
            templateId: {
              _errors: ["Template not found"],
            },
          })
        }
        broadcastName = template.name
      } else {
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
    }

    const { buttons, ...insertValues } = parsedInput

    const [broadcast] = await db
      .insert(broadcastModel)
      .values({
        ...insertValues,
        name: broadcastName,
        workspaceId,
        status: "scheduled",
        schedulesAt: startOfMinute(
          new Date(parsedInput.schedulesAt ?? new Date()),
        ),
        templateData: parsedInput.templateData
          ? {
              ...(parsedInput.templateData as Record<string, unknown>),
              buttons: buttons ?? [],
            }
          : null,
      })
      .returning()

    return broadcast
  })
