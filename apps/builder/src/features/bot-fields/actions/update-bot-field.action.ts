"use server"

import {
  auditLogActions,
  botFieldService,
  logAudit,
} from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBotFieldRequest,
  updateBotFieldRequest,
} from "../schemas/action"

export const updateBotFieldAction = workspaceActionClient
  .inputSchema(updateBotFieldRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
      ctx: { user },
    }: {
      parsedInput: UpdateBotFieldRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      ctx: { user: { id: string } }
    }) => {
      const updated = await botFieldService.updateByKey({
        workspaceId,
        key: id,
        data: parsedInput,
      })

      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.BOT_FIELD_UPDATED,
        detail: `Campo do bot "${parsedInput.name ?? id}" atualizado`,
      })

      return updated
    },
  )
