"use server"

import { db, isDatabaseError } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationTelegramModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import type { TelegramAuthValue } from "@aha.chat/integration-telegram"
import { createId } from "@paralleldrive/cuid2"
import { headers } from "next/headers"
import { createSimpleChatbot } from "@/features/chatbot/actions/create-chatbot-action"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectTelegramRequest,
  connectTelegramRequest,
} from "../schemas/request"

export const connectTelegramAction = authActionClient
  .inputSchema(connectTelegramRequest)
  .action(
    async ({
      parsedInput: { botToken, chatbotId },
      ctx,
    }: {
      parsedInput: ConnectTelegramRequest
      ctx: { user: UserModel }
    }) => {
      try {
        const { organization } =
          await identifyChatbotAndOrganizationFromRequest(chatbotId)

        // Validate bot token and fetch bot info from Telegram
        const {
          botId,
          botUsername: username,
          firstName: first_name,
        } = await integrations.telegram.runAction("connect", { botToken })

        // Make sure the bot is not already connected
        const existedBot = await db.query.integrationTelegramModel.findFirst({
          where: {
            botId,
          },
        })
        if (existedBot) {
          throw new ChatbotXException("Bot is already connected")
        }

        return await db.transaction(async (tx) => {
          const auth: TelegramAuthValue = {
            authType: "secretText",
            secretText: botToken,
            metadata: {
              botId,
              botUsername: username,
            },
          }

          if (!chatbotId) {
            const chatbot = await createSimpleChatbot(
              tx,
              ctx.user.id,
              organization,
              {
                name: username,
                accountTimezone: "UTC",
                organizationId: organization.id,
              },
            )
            chatbotId = chatbot.id
          }

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              chatbotId,
              name: `@${username}`,
              channel: "telegram",
              sourceId: botId,
            })
            .onConflictDoUpdate({
              target: [inboxModel.channel, inboxModel.sourceId],
              set: { status: InboxStatus.connected },
            })
            .returning()
            .then((result) => result[0])

          if (!inbox) {
            throw new Error("Failed to create inbox")
          }

          await tx
            .insert(integrationTelegramModel)
            .values({
              id: createId(),
              inboxId: inbox.id,
              chatbotId,
              botId,
              botUsername: username,
              name: first_name,
              auth,
            })
            .onConflictDoUpdate({
              target: [
                integrationTelegramModel.botId,
                integrationTelegramModel.chatbotId,
              ],
              set: {
                auth,
                botUsername: username,
                name: first_name,
              },
            })

          // Register webhook URL with Telegram
          const headersList = await headers()
          const requestUrl = new URL(headersList.get("x-url") ?? "")
          const webhookUrl = new URL(
            `/integrations/telegram/webhook?botId=${botId}`,
            requestUrl.origin,
          ).toString()
          await integrations.telegram.runAction("registerWebhook", {
            botToken,
            webhookUrl,
          })

          revalidateCacheTags([
            `chatbots:${chatbotId}#telegrams`,
            `chatbots:${chatbotId}#inboxes`,
          ])

          return {
            chatbotId,
          }
        })
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Bot already connected")
        }

        logger.error(error, "Failed to connect Telegram bot")
        throw new ChatbotXException(
          "Failed to connect Telegram. Please check the bot token and try again.",
        )
      }
    },
  )
