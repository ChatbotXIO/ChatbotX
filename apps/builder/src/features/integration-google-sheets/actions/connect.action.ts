"use server"

import { HandleRequestType } from "@aha.chat/sdk"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(connectGoogleSheetsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectGoogleSheetsSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const headersList = await headers()

      const redirectUrl =
        (await integrations.GOOGLE_SHEETS.integration.handleRequest?.({
          config: integrations.GOOGLE_SHEETS.getIntegrationConfig({
            chatbotId,
            referer: parsedInput.referer,
          }),
          req: new Request(
            new URL(
              HandleRequestType.GENERATE_AUTH_URL,
              headersList.get("x-url") ?? "",
            ),
          ),
        })) as string

      return redirect(redirectUrl)
    },
  )
