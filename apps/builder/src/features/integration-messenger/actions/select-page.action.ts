"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { ChatbotModel } from "@aha.chat/database/types"
import { IntegrationType } from "@aha.chat/database/types"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@aha.chat/integration-messenger/apis/page"
import { AuthType } from "@aha.chat/sdk"
import type { ChatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { findOrganizationSettingsByKey } from "@/features/organization/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { type SelectPageRequest, selectPageRequest } from "../schemas"

export const selectPageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
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
        const messengerSetting = await findOrganizationSettingsByKey(
          {
            id: ctx.chatbot.organizationId,
          },
          "messenger",
        )

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
            authType: AuthType.oauth2,
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
                inboxType: IntegrationType.Messenger,
                sourceId: parsedInput.pageId,
              },
            },
            update: {
              updatedAt: new Date(),
            },
            create: {
              chatbotId,
              inboxType: IntegrationType.Messenger,
              sourceId: parsedInput.pageId,
            },
          })

          await tx.integrationMessenger.create({
            data: {
              chatbotId,
              inboxId: inbox.id,
              pageId: parsedInput.pageId,
              auth: auth as Prisma.InputJsonValue,
              name: parsedInput.pageName,
            },
          })
        })

        revalidateCacheTags(`chatbots:${chatbotId}#messenger`)
      } catch (_error) {
        throw new Error("Failed to select Facebook page")
      }
    },
  )
