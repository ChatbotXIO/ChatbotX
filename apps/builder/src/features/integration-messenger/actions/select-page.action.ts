"use server"

import {
  buildContext,
  organizationCredentialService,
  organizationService,
  resolvePlatformSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { getDomainFromHeader } from "@/lib/domain"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import { type SelectPageRequest, selectPageRequest } from "../schema/action"

export const selectPageAction = authActionClient
  .inputSchema(selectPageRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: SelectPageRequest
      ctx: { user: UserModel }
    }) => {
      try {
        let workspaceId = parsedInput.workspaceId

        const domain = await getDomainFromHeader()
        const organization = await organizationService.findByDomain(domain)
        const messengerCredential =
          await organizationCredentialService.findDecrypted({
            organizationId: organization.id,
            type: "messenger",
          })
        if (!messengerCredential) {
          throw new ChatbotXException("Messenger App settings not found")
        }
        const messengerSettings = messengerCredential.config

        const { appUrl } = await resolvePlatformSettings({
          organizationId: organization.id,
        })

        // make sure the page is unique
        const existedPage = await db.query.integrationMessengerModel.findFirst({
          where: {
            pageId: parsedInput.pageId,
          },
        })
        if (existedPage) {
          throw new ChatbotXException("Page is already connected")
        }

        await db.transaction(async (tx) => {
          // create new workspace if not exists
          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              organization,
              data: {
                name: parsedInput.pageName,
                timezone: "UTC",
                organizationId: organization.id,
              },
            })
            workspaceId = workspace.id
          }

          const longLivedToken = await exchangeLongLivedToken(
            messengerSettings,
            parsedInput.accessToken,
          )

          await subscribePageToAppWebhook({
            pageId: parsedInput.pageId,
            accessToken: longLivedToken,
            version: messengerSettings.version,
          })

          const auth: MessengerAuthValue = {
            authType: AuthType.oauth2,
            clientId: messengerSettings.clientId,
            clientSecret: messengerSettings.clientSecret,
            redirectUrl: "",
            tokens: {
              accessToken: longLivedToken,
            },
            metadata: {
              pageId: parsedInput.pageId,
              pageName: parsedInput.pageName,
              version: messengerSettings.version,
            },
          }

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              workspaceId,
              name: parsedInput.pageName,
              channel: "messenger",
              sourceId: parsedInput.pageId,
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

          const integrationRow = await tx
            .insert(integrationMessengerModel)
            .values({
              id: createId(),
              workspaceId,
              inboxId: inbox.id,
              pageId: parsedInput.pageId,
              auth,
              name: parsedInput.pageName,
              persistentMenus: [
                {
                  label: BRANDING_TITLE,
                  type: "url" as const,
                  url: getBrandingUrl("messenger", appUrl),
                },
              ],
              conversationStarters: [],
              personas: [],
            })
            .returning()
            .then((result) => result[0])

          const brandingCtx = await buildContext({
            workspaceId,
            integrationType: "messenger",
            integration: { ...integrationRow, auth },
          })
          await integrationMessenger.runChannelHandler("bot", "addBranding", {
            ctx: brandingCtx,
            title: BRANDING_TITLE,
            url: getBrandingUrl("messenger", appUrl),
          })
        })

        revalidateCacheTags([
          `workspaces:${workspaceId}#messenger`,
          `workspaces:${workspaceId}#inboxes`,
        ])

        return {
          workspaceId,
        }
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Page already connected")
        }

        logger.error(error, "Failed to connect Facebook page")
        throw new ChatbotXException("Failed to connect Facebook page")
      }
    },
  )
