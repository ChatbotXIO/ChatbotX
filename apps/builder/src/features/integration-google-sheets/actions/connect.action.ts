"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { integrations } from "@/integration"
import { authActionClient } from "@/lib/safe-action"
import { HandleRequestType } from "@ahachat.ai/sdk"
import { redirect } from "next/navigation"
import {
  type ConnectGoogleSheetsSchema,
  connectGoogleSheetsSchema,
} from "../schemas"

export const connectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdBindSchema)
  .schema(connectGoogleSheetsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectGoogleSheetsSchema
      bindArgsParsedInputs: ChatbotIdBindSchema
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
