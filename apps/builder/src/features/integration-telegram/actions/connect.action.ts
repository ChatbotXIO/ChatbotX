"use server"

import { telegramIntegrationService, userService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import { redirect } from "next/navigation"
import { resolveConnectOwnerId } from "@/features/channel-connect/lib/resolve-connect-owner"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { authActionClient } from "@/lib/safe-action"
import { resolveRequestTenantId } from "@/lib/tenant/request-tenant"
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
        const hostTenantId = await resolveRequestTenantId()

        // Validate bot token and fetch bot info from Telegram
        const botData = await integrations.telegram.runAction("connect", {
          botToken: parsedInput.botToken,
        })

        // Resolve ownerId before the transaction to avoid an extra read inside it
        const ownerId = await resolveConnectOwnerId({
          workspaceId,
          user: ctx.user,
        })

        // The bot token is the authorization. Recorded before
        // `telegramIntegrationService.connect` so a failed connect keeps the
        // backup; a new workspace has no id yet.
        await userService.recordConnectionAuthorization({
          userId: ctx.user.id,
          provider: "telegram",
          auth: {
            authType: "secretText",
            secretText: parsedInput.botToken,
          },
          phase: "credentialsValidated",
          workspaceId: workspaceId ?? null,
        })

        const result = await telegramIntegrationService.connect({
          workspaceId,
          ownerId,
          createdBy: ctx.user.id,
          botId: botData.id,
          botUsername: botData.username,
          botToken: parsedInput.botToken,
          hostTenantId,
          onConnected: async ({ webhookSecretToken }) => {
            // Register webhook URL with Telegram
            const webhookUrl = buildBrokerCallbackUrl(
              `/integrations/telegram/webhook?botId=${botData.id}`,
            )
            await integrations.telegram.runAction("registerWebhook", {
              botToken: parsedInput.botToken,
              webhookUrl,
              secretToken: webhookSecretToken,
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
