"use server"

import { db, isDatabaseError } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import {
  inboxModel,
  integrationInstagramModel,
} from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import type { InstagramAuthValue } from "@aha.chat/integration-instagram"
import {
  exchangeLongLivedToken,
  subscribePageToInstagramWebhook,
} from "@aha.chat/integration-instagram/apis/page"
import { AuthType } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { createSimpleChatbot } from "@/features/chatbot/actions/create-chatbot-action"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { verifyOrganizationSettings } from "@/features/organization/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { type SelectAccountRequest, selectAccountRequest } from "../schemas"

export const selectAccountAction = authActionClient
  .inputSchema(selectAccountRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: SelectAccountRequest
      ctx: { user: UserModel }
    }) => {
      try {
        let chatbotId = parsedInput.chatbotId
        const { organization } =
          await identifyChatbotAndOrganizationFromRequest(parsedInput.chatbotId)
        const settings = await verifyOrganizationSettings(organization)
        const instagramSettings = settings.instagram
        if (!instagramSettings) {
          throw new ChatbotXException("Instagram settings not found")
        }

        const existedAccount =
          await db.query.integrationInstagramModel.findFirst({
            where: {
              igId: parsedInput.igId,
            },
          })
        if (existedAccount) {
          throw new ChatbotXException("Instagram account is already connected")
        }

        await db.transaction(async (tx) => {
          if (!chatbotId) {
            const chatbot = await createSimpleChatbot(
              tx,
              ctx.user.id,
              organization,
              {
                name: parsedInput.igName,
                accountTimezone: "UTC",
                organizationId: organization.id,
              },
            )
            chatbotId = chatbot.id
          }

          const longLivedToken = await exchangeLongLivedToken(
            instagramSettings,
            parsedInput.accessToken,
          )

          await subscribePageToInstagramWebhook({
            pageId: parsedInput.pageId,
            accessToken: longLivedToken,
            version: instagramSettings.version,
          })

          const auth: InstagramAuthValue = {
            authType: AuthType.oauth2,
            clientId: instagramSettings.clientId,
            clientSecret: instagramSettings.clientSecret,
            redirectUrl: "",
            tokens: {
              accessToken: longLivedToken,
            },
            metadata: {
              igId: parsedInput.igId,
              igName: parsedInput.igName,
              pageId: parsedInput.pageId,
              version: instagramSettings.version,
            },
          }

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              chatbotId,
              inboxType: "instagram",
              sourceId: parsedInput.igId,
            })
            .onConflictDoUpdate({
              target: [
                inboxModel.chatbotId,
                inboxModel.inboxType,
                inboxModel.sourceId,
              ],
              set: {
                status: InboxStatus.connected,
              },
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationInstagramModel).values({
            id: createId(),
            chatbotId,
            inboxId: inbox.id,
            igId: parsedInput.igId,
            pageId: parsedInput.pageId,
            auth,
            name: parsedInput.igName,
            username: parsedInput.igUsername,
          })
        })

        revalidateCacheTags([
          `chatbots:${chatbotId}#instagram`,
          `chatbots:${chatbotId}#inboxes`,
        ])

        return {
          chatbotId,
        }
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Instagram account already connected")
        }

        logger.error(error, "Failed to connect Instagram account")
        throw new ChatbotXException("Failed to connect Instagram account")
      }
    },
  )
