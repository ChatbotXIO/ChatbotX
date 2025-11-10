"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import {
  ChatbotMemberRole,
  IntegrationType,
  type OrganizationSettings,
  organizationSettingsSchema,
  type UserModel,
} from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { exchangeAccessToken } from "@aha.chat/integration-whatsapp/api/auth"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@aha.chat/integration-whatsapp/api/phone-number"
import { AuthType } from "@aha.chat/sdk"
import { headers } from "next/headers"
import { findChatbot } from "@/features/chatbot/queries"
import { findOrganization } from "@/features/organization/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { BaseException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
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
      const headersList = await headers()
      const baseUrl = new URL(headersList.get("x-url") ?? "")

      // const chatbot = await findChatbot({ id: chatbotId })
      const organization = await findOrganization({
        domain: baseUrl.hostname,
      })
      if (!organization) {
        throw new BaseException("Organization not found")
      }
      const organizationSettings =
        organization?.settings as unknown as OrganizationSettings
      const { data: setting } =
        organizationSettingsSchema.safeParse(organizationSettings)
      if (!setting?.whatsapp) {
        throw new BaseException("Organization settings are not valid")
      }

      // Make sure the chatbot is in the organization
      let chatbotId = parsedInput.chatbotId
      if (chatbotId) {
        const chatbot = await findChatbot({ id: chatbotId })
        if (chatbot.organizationId !== organization.id) {
          throw new BaseException("Chatbot is not in the organization")
        }
      }

      // Trying to exchange code to access token
      if (!parsedInput.accessToken) {
        if (parsedInput.code) {
          const exchangeResult = await exchangeAccessToken(
            setting.whatsapp,
            parsedInput.code,
          )
          parsedInput.accessToken = exchangeResult.access_token
        }

        if (!parsedInput.accessToken) {
          throw new BaseException("Access token is required")
        }
      }

      const phoneNumbers = await whatsappListPhoneNumbers({
        wabaId: parsedInput.wabaId,
        accessToken: parsedInput.accessToken,
        version: setting.whatsapp.version,
      })
      if (phoneNumbers.data.length === 0) {
        throw new BaseException("No phone numbers found")
      }
      const foundPhoneNumber = phoneNumbers.data.find(
        (phoneNumber) => phoneNumber.id === parsedInput.phoneNumberId,
      )
      if (!foundPhoneNumber) {
        throw new BaseException("Phone number not found")
      }

      // make sure the phone number is unique
      const existedPhoneNumber = await prisma.integrationWhatsapp.findFirst({
        where: {
          phoneNumberId: foundPhoneNumber.id,
        },
      })
      if (existedPhoneNumber) {
        throw new BaseException("Phone number is already connected")
      }

      // Validate wabaId
      const auth: WhatsappAuthValue = {
        clientId: setting.whatsapp.clientId,
        clientSecret: setting.whatsapp.clientSecret,
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
        },
      }

      try {
        await prisma.$transaction(async (tx) => {
          // create new chatbot if not exists
          if (!chatbotId) {
            const chatbot = await tx.chatbot.create({
              data: {
                organizationId: organization.id,
                name: foundPhoneNumber.verified_name,
                accountTimezone: "UTC",
              },
            })
            await tx.chatbotUsage.create({
              data: {
                chatbotId: chatbot.id,
                maxContacts: Number.MAX_SAFE_INTEGER,
              },
            })
            chatbotId = chatbot.id

            await tx.chatbotMember.create({
              data: {
                userId: ctx.user.id,
                chatbotId,
                role: ChatbotMemberRole.owner,
                isAdmin: true,
                enableAnalytics: true,
                enableFlows: true,
                enableContacts: true,
                enableOnlyAssignedContacts: false,
                enableEmailAndPhone: true,
                enableBroadcast: true,
                enableEcommerce: false,
              },
            })
          }
          await tx.inbox.create({
            data: {
              chatbotId,
              inboxType: IntegrationType.Whatsapp,
              sourceId: foundPhoneNumber.id,
              integrationWhatsapp: {
                create: {
                  chatbotId,
                  auth: auth as Prisma.InputJsonValue,
                  phoneNumberId: foundPhoneNumber.id,
                  wabaId: parsedInput.wabaId,
                  businessId: parsedInput.businessId,
                  name: foundPhoneNumber.verified_name,
                },
              },
            },
          })
        })

        revalidateCacheTags(`users:${ctx.user.id}#chatbotMembers`)

        return {
          redirectUrl: `/chatbots/${chatbotId}/dashboard`,
        }
      } catch (err: unknown) {
        logger.error("Unable to verify whatsapp token: ", err)

        throw new BaseException("Unable to verify Whatsapp token")
      }
    },
  )
