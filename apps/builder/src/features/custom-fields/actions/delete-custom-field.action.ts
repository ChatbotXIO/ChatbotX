"use server"
import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
export const deleteFieldsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await customFieldService.delete({ workspaceId, ids: parsedInput.ids })
  })
