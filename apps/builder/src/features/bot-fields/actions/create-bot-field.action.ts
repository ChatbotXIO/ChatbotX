"use server"

import {
  auditLogActions,
  botFieldService,
  logAudit,
} from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBotFieldRequest } from "../schemas/action"

export const createBotFieldAction = workspaceActionClient
  .inputSchema(createBotFieldRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props

    const result = await botFieldService.create({
      workspaceId,
      data: parsedInput,
    })

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.BOT_FIELD_CREATED,
      detail: `Campo do bot "${parsedInput.name}" (${parsedInput.type}) criado`,
    })

    return result
  })
