"use server"

import {
  buildContext,
  connectChannelIntegration,
  platformCredentialService,
  resolvePlatformSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
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
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { revalidateCacheTags } from "@/lib/cache-helper"
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

        // make sure the page is unique
        const existedPage = await db.query.integrationMessengerModel.findFirst({
          where: {
            pageId: parsedInput.pageId,
          },
        })
        if (existedPage) {
          throw new ChatbotXException("Page is already connected")
        }

        const { createdWorkspace, brandingCtx } = await db.transaction(
          async (tx) => {
            const longLivedToken = await exchangeLongLivedToken(
              messengerSettings,
              parsedInput.accessToken,
            )

            let createdWorkspace = false
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
              createdWorkspace = true
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

            return { createdWorkspace, brandingCtx }
          },
        )

        if (createdWorkspace) {
          await updateWorkspaceLogo({
            id: workspaceId as string,
            integration: integrationMessenger,
            ctx: brandingCtx,
          })
        }

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

        logger.error({ err: error }, "Failed to connect Facebook page")
        throw new ChatbotXException("Failed to connect Facebook page")
      }
    },
  )
