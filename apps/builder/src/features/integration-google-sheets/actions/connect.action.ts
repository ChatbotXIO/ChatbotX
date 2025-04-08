"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { authActionClient } from "@/lib/safe-action"
import { HandleRequestType } from "@ahachat.ai/sdk"
import { redirect } from "next/navigation"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(connectGoogleSheetsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectGoogleSheetsSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const redirectUrl =
        (await integrations.GOOGLE_SHEETS.integration.handleRequest?.({
          config: integrations.GOOGLE_SHEETS.getIntegrationConfig({
            chatbotId,
            referer: parsedInput.referer,
          }),
          req: new Request(
            `${process.env.BASE_URL}/${HandleRequestType.GENERATE_AUTH_URL}`,
          ),
        })) as string

      return redirect(redirectUrl)
    },
  )
