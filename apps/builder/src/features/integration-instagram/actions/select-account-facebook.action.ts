"use server"

import {
  buildContext,
  connectChannelIntegration,
  platformCredentialService,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram-facebook"
import {
  integration as integrationInstagramFacebook,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram-facebook"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils/id"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import { FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE } from "@/lib/facebook-pending-auth"
import { logger } from "@/lib/log"
import { authActionClient } from "@/lib/safe-action"
import {
  type SelectFacebookAccountRequest,
  selectFacebookAccountRequest,
} from "../schemas/action-facebook"

export const selectFacebookAccountAction = authActionClient
  .inputSchema(selectFacebookAccountRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: SelectFacebookAccountRequest
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
            type: "instagramFacebook",
          })
        if (!instagramCredential) {
          throw new ChatbotXException("Instagram App settings not found")
        }
        const instagramSettings = instagramCredential.config

        // DB work only — no external API calls inside the transaction so a
        // rolled-back commit doesn't leave orphaned Facebook webhook subscriptions.
        const { integrationRow, appUrl } = await db.transaction(async (tx) => {
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

          const { appUrl } = await resolveTenantSettings({
            workspaceId,
            tx,
          })

          const auth: InstagramAuthValue = {
            authType: AuthType.oauth2,
            clientId: instagramSettings.clientId,
            clientSecret: instagramSettings.clientSecret,
            redirectUrl: "",
            tokens: {
              accessToken: parsedInput.pageAccessToken,
            },
            metadata: {
              igId: parsedInput.igId,
              igName: parsedInput.igName,
              pageId: parsedInput.pageId,
              version: parsedInput.version ?? instagramSettings.version,
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
                    type: "facebook",
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

          return { integrationRow, appUrl }
        })

        await subscribePageToInstagramWebhook({
          pageId: parsedInput.pageId,
          accessToken: parsedInput.pageAccessToken,
          version: parsedInput.version ?? instagramSettings.version,
        })

        const brandingCtx = await buildContext({
          workspaceId: workspaceId as string,
          integrationType: "instagramFacebook",
          integration: {
            ...integrationRow,
            auth: integrationRow.auth as InstagramAuthValue,
          },
        })

        await integrationInstagramFacebook.runChannelHandler(
          "bot",
          "addBranding",
          {
            ctx: brandingCtx,
            title: BRANDING_TITLE,
            url: getBrandingUrl("instagram", appUrl),
          },
        )

        // Invalidate the pending-auth cookie now that the account is connected.
        const cookieStore = await cookies()
        cookieStore.delete(FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE)

        await updateWorkspaceLogo({
          id: workspaceId as string,
          integration: integrationInstagramFacebook,
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

        logger.error(
          { err: error },
          "Failed to connect Instagram account via Facebook",
        )
        throw new ChatbotXException("Failed to connect Instagram account")
      }
    },
  )
