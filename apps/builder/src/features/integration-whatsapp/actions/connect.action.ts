"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { IntegrationType, prisma } from "@ahachat.ai/database"
import { AuthType, IntegrationException } from "@ahachat.ai/sdk"
import type { InputJsonValue } from "@prisma/client/runtime/library"
import { type ConnectWhatsappSchema, connectWhatsappSchema } from "../schemas"

export const connectWhatsappAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .schema(connectWhatsappSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectWhatsappSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp = await prisma.integrationWhatsapp.findFirst({
        where: {
          chatbotId,
        },
      })
      if (integrationWhatsapp) {
        throw new IntegrationException(
          "Whatsapp integration is already connected",
        )
      }

      // Validate wabaId
      const auth = {
        clientId: process.env.INTEGRATION_WHATSAPP_ID ?? "",
        clientSecret: process.env.INTEGRATION_WHATSAPP_SECRET ?? "",
        redirectUri: "",
        authType: AuthType.OAUTH2 as const,
        tokens: {
          accessToken: parsedInput.accessToken,
        },
        metadata: {
          wabaId: parsedInput.wabaId,
          phoneNumberId: "",
        },
      }

      auth.metadata.phoneNumberId =
        await integrations.whatsapp.actions.verifyAccessToken({
          ctx: {
            auth,
            logger: logger.getSubLogger({
              name: "whatsapp",
            }),
          },
        })

      await prisma.$transaction(async (tx) => {
        await tx.inbox.create({
          data: {
            chatbotId,
            inboxType: IntegrationType.WHATSAPP,
            integrationWhatsapp: {
              create: {
                chatbotId,
                auth: auth as InputJsonValue,
              },
            },
          },
        })
      })

      return
    },
  )
