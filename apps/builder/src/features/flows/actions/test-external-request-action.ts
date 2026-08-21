"use server"

import {
  externalRequestService,
  stripEmptyAndUnresolvedJsonValues,
} from "@chatbotx.io/business"
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
      const input =
        parsedInput.body?.bodyType === "json"
          ? {
              ...parsedInput,
              body: {
                ...parsedInput.body,
                jsonBody: stripEmptyAndUnresolvedJsonValues(
                  parsedInput.body.jsonBody,
                ),
              },
            }
          : parsedInput

      const result = await externalRequestService.execute(input, {
        workspaceId,
      })

      return {
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        responseBody: result.responseBody,
      }
    },
  )
