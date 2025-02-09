"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { integration as integrationGoogleSheets } from "@ahachat.ai/integration-google-sheets"
import type { TokenAuthSchema } from "@ahachat.ai/sdk"

export const disconnectGoogleSheets = authActionClient
  .bindArgsSchemas(chatbotIdBindSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdBindSchema
    }) => {
      const googleSheets =
        await prisma.integrationGoogleSheets.findFirstOrThrow({
          where: { chatbotId },
        })
      try {
        await integrationGoogleSheets.disconnect?.({
          clientId: process.env.AUTH_GOOGLE_ID ?? "",
          clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
          redirectUri: `${process.env.BASE_URL}/api/integrations/callback`,
          tokens: googleSheets.auth as TokenAuthSchema,
        })
      } catch (e) {
        logger.error(
          "Unable to disconnect google sheets for chatbot",
          { chatbotId },
          e,
        )
      }

      await prisma.$transaction(async (tx) => {
        await tx.integration.delete({
          where: { id: googleSheets.integrationId },
        })
      })
      return
    },
  )
