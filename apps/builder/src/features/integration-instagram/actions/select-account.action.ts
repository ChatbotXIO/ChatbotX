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
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
  exchangeLongLivedToken,
  integration as integrationInstagram,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils/id"
import { redirect } from "next/navigation"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import {
  type SelectAccountRequest,
  selectAccountRequest,
} from "../schemas/action"

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
        let workspaceId = parsedInput.workspaceId

        const ownerId = parsedInput.workspaceId
          ? ((
              await workspaceService.find({
                where: { id: parsedInput.workspaceId },
              })
            )?.ownerId ?? ctx.user.id)
          : ctx.user.id
        const instagramCredential =
          await platformCredentialService.resolveForOwner({
            ownerId,
            type: "instagram",
          })
        if (!instagramCredential) {
          throw new ChatbotXException("Instagram App settings not found")
        }
        const instagramSettings = instagramCredential.config

        const { brandingCtx } = await db.transaction(async (tx) => {
          const longLivedToken = await exchangeLongLivedToken(
            instagramSettings,
            parsedInput.accessToken,
          )

          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              data: {
                name: parsedInput.igName,
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

          const { integration: integrationRow } =
            await connectChannelIntegration({
              tx,
              ownerId,
              inboxData: {
                id: createId(),
                workspaceId: workspaceId as string,
                name: parsedInput.igName,
                channel: "instagram",
                sourceId: parsedInput.igId,
              },
              insertIntegration: async (inboxId) =>
                tx
                  .insert(integrationInstagramModel)
                  .values({
                    id: createId(),
                    workspaceId: workspaceId as string,
                    inboxId,
                    igId: parsedInput.igId,
                    pageId: parsedInput.pageId,
                    auth,
                    name: parsedInput.igName,
                    username: parsedInput.igUsername,
                    persistentMenus: [
                      {
                        label: BRANDING_TITLE,
                        type: "url" as const,
                        url: getBrandingUrl("instagram", appUrl),
                      },
                    ],
                    conversationStarters: [],
                  })
                  .returning()
                  .then((result) => result[0]),
            })

          const brandingCtx = await buildContext({
            workspaceId,
            integrationType: "instagram",
            integration: {
              ...integrationRow,
              auth: integrationRow.auth as InstagramAuthValue,
            },
          })

          await integrationInstagram.runChannelHandler("bot", "addBranding", {
            ctx: brandingCtx,
            title: BRANDING_TITLE,
            url: getBrandingUrl("instagram", appUrl),
          })

          return { brandingCtx }
        })

        await updateWorkspaceLogo({
          id: workspaceId as string,
          integration: integrationInstagram,
          ctx: brandingCtx,
        })

        return {
          workspaceId,
        }
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (error.code === "channelDuplicated" && parsedInput.workspaceId) {
            redirect(
              `/space/${parsedInput.workspaceId}/settings/channels?channel=instagram&error=duplicated`,
            )
          }
          throw error
        }
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Instagram account already connected")
        }

        logger.error({ err: error }, "Failed to connect Instagram account")
        throw new ChatbotXException("Failed to connect Instagram account")
      }
    },
  )
