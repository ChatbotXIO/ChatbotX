"use server"

import {
  telegramIntegrationService,
  userQuotaService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import { redirect } from "next/navigation"
import { isCloud } from "@/env"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectTelegramRequest,
  connectTelegramRequest,
} from "../schema/request"

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
        const workspaceId = parsedInput.workspaceId ?? undefined

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

        const result = await telegramIntegrationService.connect({
          workspaceId,
          ownerId,
          createdBy: ctx.user.id,
          botId: botData.id,
          botUsername: botData.username,
          botToken: parsedInput.botToken,
          onConnected: async () => {
            // Register webhook URL with Telegram
            const webhookUrl = buildBrokerCallbackUrl(
              `/integrations/telegram/webhook?botId=${botData.id}`,
            )
            await integrations.telegram.runAction("registerWebhook", {
              botToken: parsedInput.botToken,
              webhookUrl,
            })
          },
        })

        if (result.createdWorkspace) {
          await auditService.record({
            userId: ctx.user.id,
            workspaceId: result.workspaceId,
            action: "create",
            detail: `created the workspace (#${result.workspaceId})`,
          })
        }

        if (result.wasCreated) {
          await auditService.record({
            workspaceId: result.workspaceId,
            action: "connect",
            detail: `connected a new Telegram channel (#${result.integrationId})`,
          })
        }

        return { workspaceId: result.workspaceId }
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (error.code === "channelDuplicated" && parsedInput.workspaceId) {
            redirect(
              `/space/${parsedInput.workspaceId}/settings/channels?channel=telegram&error=duplicated`,
            )
          }
          throw error
        }

        logger.error(error, "Failed to connect Telegram bot")
        throw new ChatbotXException(
          "Failed to connect Telegram. Please check the bot token and try again.",
        )
      }
    },
  )
