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

    const [broadcast] = await db
      .insert(broadcastModel)
      .values({
        ...parsedInput,
        name: broadcastName,
        workspaceId,
        status: "scheduled",
        schedulesAt: startOfMinute(
          new Date(parsedInput.schedulesAt ?? new Date()),
        ),
        templateData: parsedInput.templateData ?? "{}",
      })
      .returning()

    return broadcast
  })
