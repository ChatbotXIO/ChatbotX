"use server"

import { broadcastService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { findBroadcastChannelCapability } from "@chatbotx.io/database/partials"
import { pruneEmailPhoneFilterConditions } from "@chatbotx.io/database/queries/contact-filter/permission"
import { broadcastModel } from "@chatbotx.io/database/schema"
import { startOfMinute } from "date-fns"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
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
    const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
    const canViewEmailAndPhone = userAndWorkspace
      ? canViewContactEmailAndPhone(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )
      : false

    const capability = findBroadcastChannelCapability(parsedInput.channel)
    if (!capability) {
      return returnValidationErrors(createBroadcastRequest, {
        _errors: ["Validation Exception"],
        channel: {
          _errors: ["Unsupported broadcast channel"],
        },
      })
    }

    if (!capability.subactions.includes(parsedInput.subaction)) {
      return returnValidationErrors(createBroadcastRequest, {
        _errors: ["Validation Exception"],
        subaction: {
          _errors: ["Unsupported broadcast subaction"],
        },
      })
    }

    if (!(parsedInput.flowId || parsedInput.templateId)) {
      return returnValidationErrors(createBroadcastRequest, {
        _errors: ["Validation Exception"],
        flowId: {
          _errors: ["Either flow or template must be selected"],
        },
      })
    }

    if (parsedInput.templateId && !capability.supportsTemplateBroadcast) {
      return returnValidationErrors(createBroadcastRequest, {
        _errors: ["Validation Exception"],
        templateId: {
          _errors: ["Template broadcasts are not supported for this channel"],
        },
      })
    }

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
      const templateBroadcastName =
        await broadcastService.resolveTemplateBroadcastName({
          workspaceId,
          channel: parsedInput.channel,
          templateId: parsedInput.templateId,
          integrationMessengerId: parsedInput.integrationMessengerId,
          integrationWhatsappId: parsedInput.integrationWhatsappId,
        })

      if (!templateBroadcastName) {
        return returnValidationErrors(createBroadcastRequest, {
          _errors: ["Validation Exception"],
          templateId: {
            _errors: ["Template not found"],
          },
        })
      }

      broadcastName = templateBroadcastName
    }

    const { buttons, ...insertValues } = parsedInput
    const contactFilter = pruneEmailPhoneFilterConditions(
      insertValues.contactFilter,
      canViewEmailAndPhone,
    )

    const [broadcast] = await db
      .insert(broadcastModel)
      .values({
        ...insertValues,
        contactFilter,
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
