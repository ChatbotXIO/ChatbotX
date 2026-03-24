"use server"

import { db } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationWhatsappModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import {
  addSystemUser,
  registerPhoneNumber,
  shareCreditLine,
  type WhatsappAuthValue,
} from "@aha.chat/integration-whatsapp"
import { exchangeAccessToken } from "@aha.chat/integration-whatsapp/api/auth"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@aha.chat/integration-whatsapp/api/phone-number"
import { subscribeWebhook } from "@aha.chat/integration-whatsapp/api/webhook"
import { AuthType } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { headers } from "next/headers"
import { env } from "@/env"
import { createSimpleChatbot } from "@/features/chatbot/actions/create-chatbot-action"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { verifyOrganizationSettings } from "@/features/organization/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { authActionClient } from "@/lib/safe-action"
import { type ConnectWhatsappSchema, connectWhatsappSchema } from "../schemas"

export const connectWhatsappAction = authActionClient
  .inputSchema(connectWhatsappSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: ConnectWhatsappSchema
    }) => {
      try {
        let chatbotId = parsedInput.chatbotId
        const { organization } =
          await identifyChatbotAndOrganizationFromRequest(parsedInput.chatbotId)
        const settings = await verifyOrganizationSettings(organization)
        const whatsappSettings = settings.whatsapp
        if (!whatsappSettings) {
          throw new ChatbotXException("Whatsapp settings not found")
        }

        // Trying to exchange code to access token
        if (!parsedInput.accessToken) {
          if (parsedInput.code) {
            const exchangeResult = await exchangeAccessToken(
              whatsappSettings,
              parsedInput.code,
            )
            parsedInput.accessToken = exchangeResult.access_token
          }

          if (!parsedInput.accessToken) {
            throw new ChatbotXException("Access token is required")
          }
        }

        const phoneNumbers = await whatsappListPhoneNumbers({
          wabaId: parsedInput.wabaId,
          accessToken: parsedInput.accessToken,
          version: whatsappSettings.version,
        })
        if (phoneNumbers.data.length === 0) {
          throw new ChatbotXException("No phone numbers found")
        }
        const foundPhoneNumber = phoneNumbers.data.find(
          (phoneNumber) => phoneNumber.id === parsedInput.phoneNumberId,
        )
        if (!foundPhoneNumber) {
          throw new ChatbotXException("Phone number not found")
        }

        // make sure the phone number is unique
        const existedPhoneNumber =
          await db.query.integrationWhatsappModel.findFirst({
            where: {
              phoneNumberId: foundPhoneNumber.id,
            },
          })
        if (existedPhoneNumber) {
          throw new ChatbotXException("Phone number is already connected")
        }

        // Validate wabaId
        const headersList = await headers()
        const baseUrl = headersList.get("x-url") ?? env.NEXT_PUBLIC_BUILDER_URL
        const proxyUrl = env.NEXT_PUBLIC_WEBHOOK_PROXY_URL ?? baseUrl
        const auth: WhatsappAuthValue = {
          clientId: whatsappSettings.clientId,
          clientSecret: whatsappSettings.clientSecret,
          verifyToken: whatsappSettings.verifyToken,
          redirectUrl: new URL(
            "integrations/whatsapp/callback",
            baseUrl,
          ).toString(),
          authType: AuthType.oauth2,
          tokens: {
            accessToken: parsedInput.accessToken,
          },
          metadata: {
            wabaId: parsedInput.wabaId,
            phoneNumber: foundPhoneNumber,
            businessId: parsedInput.businessId,
            webhookUrl: `${proxyUrl}/integrations/whatsapp/webhook`,
          },
        }

        await addSystemUser({
          auth,
          whatsappSettings,
        })
        console.info("addSystemUser")

        if (whatsappSettings.businessId) {
          await shareCreditLine({
            auth,
            whatsappSettings,
          })
          console.info("shareCreditLine")
        }

        await registerPhoneNumber({
          auth,
        })
        console.info("registerPhoneNumber")

        await subscribeWebhook({
          auth,
        })
        console.info("subscribeWebhook")

        await db.transaction(async (tx) => {
          // create new chatbot if not exists
          if (!chatbotId) {
            const chatbot = await createSimpleChatbot(
              tx,
              ctx.user.id,
              organization,
              {
                name: foundPhoneNumber.verified_name,
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
              chatbotId: chatbotId as string,
              channel: "whatsapp",
              sourceId: foundPhoneNumber.id,
              name: foundPhoneNumber.verified_name,
            })
            .onConflictDoUpdate({
              target: [inboxModel.channel, inboxModel.sourceId],
              set: {
                status: InboxStatus.connected,
              },
            })
            .returning()
            .then((result) => result[0])

          await tx
            .insert(integrationWhatsappModel)
            .values({
              id: createId(),
              chatbotId,
              inboxId: inbox.id,
              auth,
              phoneNumberId: foundPhoneNumber.id,
              wabaId: parsedInput.wabaId,
              businessId: parsedInput.businessId,
              name: foundPhoneNumber.verified_name,
            })
            .onConflictDoUpdate({
              target: [integrationWhatsappModel.inboxId],
              set: {
                updatedAt: new Date(),
              },
            })
        })

        revalidateCacheTags(`users:${ctx.user.id}#chatbotMembers`)

        return {
          redirectUrl: `/chatbots/${chatbotId}/dashboard`,
        }
      } catch (err: unknown) {
        console.error(err, "Unable to verify whatsapp token")

        throw new ChatbotXException("Unable to verify Whatsapp token")
      }
    },
  )
