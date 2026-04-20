"use server"

import { db } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  addSystemUser,
  registerPhoneNumber,
  shareCreditLine,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { exchangeAccessToken } from "@chatbotx.io/integration-whatsapp/api/auth"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { subscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { headers } from "next/headers"
import { env } from "@/env"
import { organizationService } from "@/features/organization/organization-service"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { getDomainFromHeader } from "@/lib/domain"
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
        let workspaceId = parsedInput.workspaceId

        const domain = await getDomainFromHeader()
        const organization = await organizationService.findByDomain(domain)
        const whatsappSettings = organization.settings.whatsapp
        if (!whatsappSettings) {
          throw new ChatbotXException("Whatsapp App settings not found")
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
            webhookUrl: `${baseUrl}/integrations/whatsapp/webhook`,
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
          // create new workspace if not exists
          if (!workspaceId) {
            const workspace = await createSimpleWorkspace(
              tx,
              ctx.user.id,
              organization,
              {
                name: foundPhoneNumber.verified_name,
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
              workspaceId: workspaceId as string,
              channel: "whatsapp",
              sourceId: foundPhoneNumber.id,
              name: foundPhoneNumber.verified_name,
            })
            .onConflictDoUpdate({
              target: [inboxModel.channel, inboxModel.sourceId],
              set: {
                status: inboxStatuses.enum.connected,
              },
            })
            .returning()
            .then((result) => result[0])

          await tx
            .insert(integrationWhatsappModel)
            .values({
              id: createId(),
              workspaceId,
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

        revalidateCacheTags(`users:${ctx.user.id}#workspaceMembers`)

        return {
          redirectUrl: `/space/${workspaceId}/dashboard`,
        }
      } catch (err: unknown) {
        console.error(err, "Unable to verify whatsapp token")

        throw new ChatbotXException("Unable to verify Whatsapp token")
      }
    },
  )
