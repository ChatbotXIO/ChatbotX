"use server"

import {
  connectChannelIntegration,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { integrationTypes } from "@chatbotx.io/database/partials"
import { integrationTelegramModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { TelegramAuthValue } from "@chatbotx.io/integration-telegram"
import { createId } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { isCloud } from "@/env"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectTelegramRequest,
  connectTelegramRequest,
} from "../schemas/request"

export const connectTelegramAction = authActionClient
  .inputSchema(connectTelegramRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: ConnectTelegramRequest
      ctx: { user: UserModel }
    }) => {
      try {
        let workspaceId = parsedInput.workspaceId

        // Validate bot token and fetch bot info from Telegram
        const botData = await integrations.telegram.runAction("connect", {
          botToken: parsedInput.botToken,
        })

        // Resolve ownerId before the transaction to avoid an extra read inside it
        let ownerId = ctx.user.id
        if (workspaceId) {
          const workspace = await workspaceService.findOrFail({
            where: { id: workspaceId },
          })
          ownerId = workspace.ownerId
        }

        if (!workspaceId && isCloud()) {
          const { blocked, reason } = await userQuotaService.getAccessState(
            ctx.user.id,
          )
          if (blocked) {
            throw reason === "mac"
              ? new ChatbotXException(
                  "Monthly active contact limit reached",
                  "macLimitReached",
                  403,
                )
              : new ChatbotXException("Trial expired", "trialExpired", 403)
          }
        }

        return await db.transaction(async (tx) => {
          const auth: TelegramAuthValue = {
            authType: "secretText",
            secretText: parsedInput.botToken,
          }

          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              data: {
                name: botData.username,
                timezone: "UTC",
                ownerId: ctx.user.id,
              },
            })
            workspaceId = workspace.id
          }

          await connectChannelIntegration({
            tx,
            ownerId,
            inboxData: {
              id: createId(),
              workspaceId: workspaceId as string,
              name: botData.username,
              channel: integrationTypes.enum.telegram,
              sourceId: botData.id,
            },
            insertIntegration: async (inboxId) => {
              await tx.insert(integrationTelegramModel).values({
                id: createId(),
                inboxId,
                workspaceId: workspaceId as string,
                botId: botData.id,
                name: botData.username,
                auth,
              })
            },
          })

          // Register webhook URL with Telegram
          const webhookUrl = buildBrokerCallbackUrl(
            `/integrations/telegram/webhook?botId=${botData.id}`,
          )
          await integrations.telegram.runAction("registerWebhook", {
            botToken: parsedInput.botToken,
            webhookUrl,
          })

          return { workspaceId }
        })
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (error.code === "channelDuplicated" && parsedInput.workspaceId) {
            redirect(
              `/space/${parsedInput.workspaceId}/settings/channels?channel=telegram&error=duplicated`,
            )
          }
          throw error
        }
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
