"use server"

import {
  buildContext,
  connectChannelIntegration,
  platformCredentialService,
  resolvePlatformSettings,
  tagSyncService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
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
        let connectedIntegrationId: string | undefined

        const platformOwnerId = parsedInput.workspaceId
          ? ((
              await workspaceService.find({
                where: { id: parsedInput.workspaceId },
              })
            )?.ownerId ?? ctx.user.id)
          : ctx.user.id

        const messengerCredential =
          await platformCredentialService.resolveForOwner({
            ownerId: platformOwnerId,
            type: "messenger",
          })

        if (!messengerCredential) {
          throw new ChatbotXException("Messenger App settings not found")
        }
        const messengerSettings = messengerCredential.config

        let integrationId = ""

        const { brandingCtx } = await db.transaction(async (tx) => {
          const longLivedToken = await exchangeLongLivedToken(
            messengerSettings,
            parsedInput.accessToken,
          )

          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              data: {
                name: parsedInput.pageName,
                timezone: "UTC",
                ownerId: ctx.user.id,
              },
            })
            workspaceId = workspace.id
          }

          const { appUrl } = await resolvePlatformSettings({
            workspaceId,
            tx,
          })

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

          const { integration: integrationRow } =
            await connectChannelIntegration({
              tx,
              ownerId: platformOwnerId,
              inboxData: {
                id: createId(),
                workspaceId: workspaceId as string,
                name: parsedInput.pageName,
                channel: "messenger",
                sourceId: parsedInput.pageId,
              },
              insertIntegration: async (inboxId) =>
                tx
                  .insert(integrationMessengerModel)
                  .values({
                    id: createId(),
                    workspaceId: workspaceId as string,
                    inboxId,
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
                  .then((result) => result[0]),
            })

          integrationId = integrationRow.id
          connectedIntegrationId = integrationRow?.id

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

          return { brandingCtx }
        })

        await updateWorkspaceLogo({
          id: workspaceId as string,
          integration: integrationMessenger,
          ctx: brandingCtx,
        })

        if (!integrationId) {
          throw new ChatbotXException("Failed to create integration")
        }

        // Import any labels already on the page into local tags + mappings.
        if (connectedIntegrationId) {
          await tagSyncService.enqueueChannelScan({
            workspaceId: workspaceId as string,
            channelType: channelTypes.enum.messenger,
            integrationId: connectedIntegrationId,
          })
        }

        return {
          workspaceId,
          integrationId,
        }
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (error.code === "channelDuplicated" && parsedInput.workspaceId) {
            redirect(
              `/space/${parsedInput.workspaceId}/settings/channels?channel=messenger&error=duplicated`,
            )
          }
          throw error
        }
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Page already connected")
        }

        logger.error({ err: error }, "Failed to connect Facebook page")
        throw new ChatbotXException("Failed to connect Facebook page")
      }
    },
  )
