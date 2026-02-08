"use server"

import { Prisma, prisma } from "@aha.chat/database"
import { InboxStatus } from "@aha.chat/database/enums"
import type { UserModel } from "@aha.chat/database/types"
import { IntegrationType } from "@aha.chat/database/types"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@aha.chat/integration-messenger/apis/page"
import { AuthType } from "@aha.chat/sdk"
import { createSimpleChatbot } from "@/features/chatbot/actions/create-chatbot-action"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { verifyOrganizationSettings } from "@/features/organization/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { BaseException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { type SelectPageRequest, selectPageRequest } from "../schemas"

export const selectPageAction = authActionClient
  .inputSchema(selectPageRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: SelectPageRequest
      ctx: { user: UserModel }
    }) => {
      try {
        let chatbotId = parsedInput.chatbotId
        const { organization } =
          await identifyChatbotAndOrganizationFromRequest(parsedInput.chatbotId)
        const settings = await verifyOrganizationSettings(organization)
        const messengerSettings = settings.messenger
        if (!messengerSettings) {
          throw new BaseException("Messenger settings not found")
        }

        await prisma.$transaction(async (tx) => {
          // create new chatbot if not exists
          if (!chatbotId) {
            const chatbot = await createSimpleChatbot(
              tx,
              ctx.user.id,
              organization,
              {
                name: parsedInput.pageName,
                accountTimezone: "UTC",
                organizationId: organization.id,
              },
            )
            chatbotId = chatbot.id
          }

          const longLivedToken = await exchangeLongLivedToken(
            messengerSettings,
            parsedInput.accessToken,
          )

          await subscribePageToAppWebhook({
            pageId: parsedInput.pageId,
            accessToken: longLivedToken,
            version: messengerSettings.version,
          })

          const auth: MessengerAuthValue = {
            authType: AuthType.oauth2,
            clientId: messengerSettings.clientId,
            clientSecret: messengerSettings.clientSecret,
            redirectUrl: "",
            tokens: {
              accessToken: longLivedToken,
            },
            metadata: {
              pageId: parsedInput.pageId,
              pageName: parsedInput.pageName,
              version: messengerSettings.version,
            },
          }

          const inbox = await tx.inbox.upsert({
            where: {
              chatbotId_inboxType_sourceId: {
                chatbotId,
                inboxType: IntegrationType.messenger,
                sourceId: parsedInput.pageId,
              },
            },
            update: {
              status: InboxStatus.connected,
            },
            create: {
              chatbotId,
              inboxType: IntegrationType.messenger,
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

        revalidateCacheTags([
          `chatbots:${chatbotId}#messenger`,
          `chatbots:${chatbotId}#inboxes`,
        ])

        return {
          chatbotId,
        }
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new BaseException("Page already connected")
        }

        logger.error(error, "Failed to connect Facebook page")
        throw new BaseException("Failed to connect Facebook page")
      }
    },
  )
