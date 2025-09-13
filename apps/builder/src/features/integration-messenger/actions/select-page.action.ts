"use server"

import { IntegrationType, prisma } from "@aha.chat/database"
import type {
  ChatbotModel,
  OrganizationSettings,
} from "@aha.chat/database/types"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import { AuthType } from "@aha.chat/sdk"
import { revalidateTag } from "next/cache"
import type { Prisma } from "node_modules/@aha.chat/database/src/generated/prisma/client"
import type { ChatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { findOrganization } from "@/features/organization/queries"
import { chatbotActionClient } from "@/lib/safe-action"
import { exchangeLongLivedToken } from "../libs/facebook"
import {
  type SelectPageRequest,
  selectPageRequest,
  validateOrganizationSettingSchema,
} from "../schemas"

export const selectPageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(selectPageRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      ctx: {
        chatbot: ChatbotModel
      }
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: SelectPageRequest
    }) => {
      try {
        const organization = await findOrganization({
          id: ctx.chatbot.organizationId,
        })
        const organizationSettings =
          organization?.settings as unknown as OrganizationSettings
        const { data: setting } =
          validateOrganizationSettingSchema.safeParse(organizationSettings)
        if (!setting) {
          throw new Error("Organization settings are not valid")
        }

        const longLivedToken = await exchangeLongLivedToken(
          organizationSettings,
          parsedInput.accessToken,
        )

        await prisma.$transaction(async (tx) => {
          const auth: MessengerAuthValue = {
            authType: AuthType.OAUTH2,
            clientId: setting.messengerClientId,
            clientSecret: setting.messengerClientSecret,
            redirectUri: "",
            tokens: {
              accessToken: longLivedToken,
            },
            metadata: {
              pageName: parsedInput.pageName,
              version: setting.messengerVersion,
            },
          }

          await tx.inbox.create({
            data: {
              chatbotId,
              inboxType: IntegrationType.MESSENGER,
              integrationMessenger: {
                create: {
                  chatbotId,
                  pageId: parsedInput.pageId,
                  auth: auth as Prisma.InputJsonValue,
                },
              },
            },
          })
        })

        revalidateTag(`chatbots:${chatbotId}#messenger`)
      } catch (_error) {
        throw new Error("Failed to select Facebook page")
      }
    },
  )
