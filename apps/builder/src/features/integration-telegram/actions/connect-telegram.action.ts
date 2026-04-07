"use server"

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
import { headers } from "next/headers"
import { identifyWorkspaceAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
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
        const {
          botId,
          botUsername,
          firstName: first_name,
        } = await integrations.telegram.runAction("connect", { botToken })

        // Make sure the bot is not already connected
        await throwIfExists({
          table: integrationTelegramModel,
          where: {
            botId,
          },
          message: "Bot is already connected",
        })

        return await db.transaction(async (tx) => {
          const auth: TelegramAuthValue = {
            authType: "secretText",
            secretText: botToken,
            metadata: {
              botId,
              botUsername,
            },
          }

          if (!workspaceId) {
            const workspace = await createSimpleWorkspace(
              tx,
              ctx.user.id,
              organization,
              {
                name: botUsername,
                timezone: "UTC",
                organizationId: organization.id,
              },
            )
            workspaceId = workspace.id
          }

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              workspaceId,
              name: botUsername,
              channel: integrationTypes.enum.telegram,
              sourceId: botId,
            })
            .onConflictDoUpdate({
              target: [inboxModel.channel, inboxModel.sourceId],
              set: { status: inboxStatuses.enum.connected },
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
            botId,
            botUsername,
            name: first_name,
            auth,
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
