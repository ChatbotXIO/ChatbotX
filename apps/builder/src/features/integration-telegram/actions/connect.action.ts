"use server"

import { workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  db,
  isDatabaseError,
  throwIfExists,
} from "@chatbotx.io/database/client"
import { inboxStatuses, integrationTypes } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationTelegramModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { TelegramAuthValue } from "@chatbotx.io/integration-telegram"
import { createId } from "@chatbotx.io/utils"
import { identifyWorkspaceAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { getOriginUrlFromHeader } from "@/lib/domain"
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
      parsedInput: { botToken, workspaceId },
      ctx,
    }: {
      parsedInput: ConnectTelegramRequest
      ctx: { user: UserModel }
    }) => {
      try {
        const { organization } =
          await identifyWorkspaceAndOrganizationFromRequest(workspaceId)

        // Validate bot token and fetch bot info from Telegram
        const botData = await integrations.telegram.runAction("connect", {
          botToken,
        })

        // Make sure the bot is not already connected
        await throwIfExists({
          table: integrationTelegramModel,
          where: {
            botId: botData.id,
          },
          message: "Bot is already connected",
        })

        return await db.transaction(async (tx) => {
          const auth: TelegramAuthValue = {
            authType: "secretText",
            secretText: botToken,
          }

          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              organization,
              data: {
                name: botData.username,
                timezone: "UTC",
                organizationId: organization.id,
              },
            })
            workspaceId = workspace.id
          }

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              workspaceId,
              name: botData.username,
              channel: integrationTypes.enum.telegram,
              sourceId: botData.id,
            })
            .onConflictDoUpdate({
              target: [
                inboxModel.workspaceId,
                inboxModel.channel,
                inboxModel.sourceId,
              ],
              set: {
                status: inboxStatuses.enum.connected,
              },
            })
            .returning()
            .then((result) => result[0])

          if (!inbox) {
            throw new Error("Failed to create inbox")
          }

          await tx.insert(integrationTelegramModel).values({
            id: createId(),
            inboxId: inbox.id,
            workspaceId,
            botId: botData.id,
            name: botData.username,
            auth,
          })

          // Register webhook URL with Telegram
          const originUrl = await getOriginUrlFromHeader()
          const webhookUrl = new URL(
            `/integrations/telegram/webhook?botId=${botData.id}`,
            originUrl,
          ).toString()
          await integrations.telegram.runAction("registerWebhook", {
            botToken,
            webhookUrl,
          })

          revalidateCacheTags([
            `workspaces:${workspaceId}#telegrams`,
            `workspaces:${workspaceId}#inboxes`,
          ])

          return {
            workspaceId,
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
