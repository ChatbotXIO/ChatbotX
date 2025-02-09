"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { authActionClient } from "@/lib/safe-action"
import { integration } from "@ahachat.ai/integration-google-sheets"
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
      if (!integration.connect) {
        return
      }

      const redirectUrl = await integration.connect({
        clientId: process.env.AUTH_GOOGLE_ID ?? "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
        redirectUri: `${process.env.BASE_URL}/api/integrations/callback`,
        stateParams: {
          chatbotId,
          providerName: "google-sheets",
          referer: parsedInput.referer,
        },
      })

      return redirect(redirectUrl ?? "")
    },
  )
