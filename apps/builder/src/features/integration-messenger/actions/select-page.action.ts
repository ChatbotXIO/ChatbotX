"use server"

import { IntegrationType, prisma } from "@aha.chat/database"
import {
  type ChatbotModel,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@aha.chat/integration-messenger/apis/page"
import { AuthType } from "@aha.chat/sdk"
import { revalidateTag } from "next/cache"
import type { Prisma } from "node_modules/@aha.chat/database/src/generated/prisma/client"
import type { ChatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { findOrganization } from "@/features/organization/queries"
import { chatbotActionClient } from "@/lib/safe-action"
import { type SelectPageRequest, selectPageRequest } from "../schemas"

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
        const { data: setting } = organizationSettingsSchema.safeParse(
          organization.settings,
        )
        if (!setting?.messenger) {
          throw new Error("Organization settings are not valid")
        }

        const messengerSetting = setting.messenger

        await prisma.$transaction(async (tx) => {
          const longLivedToken = await exchangeLongLivedToken(
            messengerSetting,
            parsedInput.accessToken,
          )

          await subscribePageToAppWebhook({
            pageId: parsedInput.pageId,
            accessToken: longLivedToken,
            version: messengerSetting.version,
          })

          const auth: MessengerAuthValue = {
            authType: AuthType.OAUTH2,
            clientId: messengerSetting.clientId,
            clientSecret: messengerSetting.clientSecret,
            redirectUrl: "",
            tokens: {
              accessToken: longLivedToken,
            },
            metadata: {
              pageId: parsedInput.pageId,
              pageName: parsedInput.pageName,
              version: messengerSetting.version,
            },
          }

          const inbox = await tx.inbox.upsert({
            where: {
              chatbotId_inboxType_sourceId: {
                chatbotId,
                inboxType: IntegrationType.MESSENGER,
                sourceId: parsedInput.pageId,
              },
            },
            update: {
              updatedAt: new Date(),
            },
            create: {
              chatbotId,
              inboxType: IntegrationType.MESSENGER,
              sourceId: parsedInput.pageId,
            },
          })

          await tx.integrationMessenger.create({
            data: {
              chatbotId,
              inboxId: inbox.id,
              pageId: parsedInput.pageId,
              auth: auth as Prisma.InputJsonValue,
            },
          })
        })

        revalidateTag(`chatbots:${chatbotId}#messenger`)
      } catch (_error) {
        throw new Error("Failed to select Facebook page")
      }
    },
  )
