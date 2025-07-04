"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { BaseException } from "@/lib/error"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { IntegrationType, type Prisma, prisma } from "@ahachat.ai/database"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import { AuthType, IntegrationException } from "@ahachat.ai/sdk"
import { type ConnectWhatsappSchema, connectWhatsappSchema } from "../schemas"

export const connectWhatsappAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(connectWhatsappSchema)
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
      const auth: WhatsappAuthValue = {
        clientId: process.env.INTEGRATION_WHATSAPP_ID ?? "",
        clientSecret: process.env.INTEGRATION_WHATSAPP_SECRET ?? "",
        redirectUri: "",
        authType: AuthType.OAUTH2 as const,
        tokens: {
          accessToken: parsedInput.accessToken,
        },
        metadata: {
          wabaId: parsedInput.wabaId,
        },
      }

      try {
        const whatsappPhoneNumber =
          await integrations.WHATSAPP.integration.actions?.verifyAccessToken({
            ctx: {
              auth,
              logger: logger.getSubLogger({
                name: "whatsapp",
              }),
            },
          })
        if (whatsappPhoneNumber) {
          auth.metadata = {
            ...auth.metadata,
            businessId: "627055339164151",
            phoneNumber: whatsappPhoneNumber,
          }
        }

        await prisma.$transaction(async (tx) => {
          await tx.inbox.create({
            data: {
              chatbotId,
              inboxType: IntegrationType.WHATSAPP,
              integrationWhatsapp: {
                create: {
                  chatbotId,
                  auth: auth as Prisma.InputJsonValue,
                },
              },
            },
          })
        })
      } catch (err: unknown) {
        logger
          .getSubLogger({
            name: "whatsapp",
          })
          .error("Unable to verify whatsapp token: ", err)

        throw new BaseException("Unable to verify Whatsapp token")
      }
    },
  )
