"use server"

import { externalRequestService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { externalRequestFieldsSchema } from "@chatbotx.io/flow-config"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
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
      const t = await getTranslations("flows.externalRequest.errors")

      try {
        const result = await externalRequestService.execute(parsedInput, {
          workspaceId,
        })

        return {
          statusCode: result.statusCode,
          durationMs: result.durationMs,
          responseBody: result.responseBody,
        }
      } catch (err) {
        if (err instanceof ChatbotXException) {
          throw err
        }

        logger.error({ err, workspaceId }, "External request test failed")
        throw new ChatbotXException(t("requestFailed"), "externalRequestFailed")
      }
    },
  )
