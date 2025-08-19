"use server"

import { IntegrationType, type Prisma, prisma } from "@aha.chat/database"
import type { OrganizationSettings } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { AuthType, IntegrationException } from "@aha.chat/sdk"
import { findChatbot } from "@/features/chatbot/queries"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { findOrganization } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { BaseException } from "@/lib/error"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
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
      if (!integrationWhatsapp) {
        throw new IntegrationException(
          "Whatsapp integration is already connected",
        )
      }

      const chatbot = await findChatbot({ id: chatbotId })
      const organization = await findOrganization({
        id: chatbot.organizationId,
      })
      const organizationSettings =
        organization?.settings as unknown as OrganizationSettings

      // Validate wabaId
      const auth: WhatsappAuthValue = {
        clientId: organizationSettings.whatsappClientId,
        clientSecret: organizationSettings.whatsappClientSecret,
        redirectUri: "",
        authType: AuthType.OAUTH2,
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
        logger.error("Unable to verify whatsapp token: ", err)

        throw new BaseException("Unable to verify Whatsapp token")
      }
    },
  )
