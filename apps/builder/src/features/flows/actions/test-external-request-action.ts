"use server"

import { externalRequestService } from "@chatbotx.io/business"
import { externalRequestFieldsSchema } from "@chatbotx.io/flow-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const testExternalRequestAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(externalRequestFieldsSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: typeof externalRequestFieldsSchema._output
    }) => {
      const result = await externalRequestService.execute(parsedInput, {
        workspaceId,
      })

      return {
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        responseBody: result.responseBody,
      }
    },
  )
