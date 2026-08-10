"use server"

import {
  buildContext,
  connectChannelIntegration,
  instagramIntegrationService,
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
import { AuthType, SdkException } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils/id"
import { redirect } from "next/navigation"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { updateWorkspaceLogo } from "@/features/workspaces/actions/upload-logo"
import {
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"
import { persistIntegrationUserInfo } from "@/lib/integration-user-info"
import { logger } from "@/lib/log"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
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

        const ownerId = await resolvePlatformOwnerId({
          userId: ctx.user.id,
          workspaceId: parsedInput.workspaceId,
        })

        const instagramCredential =
          await platformCredentialService.resolveForOwner({
            ownerId,
            type: "instagramFacebook",
          })
        if (!instagramCredential) {
          throw new ChatbotXException("Instagram App settings not found")
        }
        const instagramSettings = instagramCredential.config

        // The OAuth callback stored the user token in the pending-auth cookie.
        // Best-effort: an expired/missing cookie only leaves
        // `auth.tokens.userAccessToken`/`userId` unset.
        const pendingAuth = await readPendingAuth(
          FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
        )
        if (!pendingAuth) {
          logger.warn(
            "Instagram pending-auth cookie missing; connecting without user access token",
          )
        }

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

        // Best-effort: the connection is already live, so a failed user-info
        // write must never fail the action.
        await persistIntegrationUserInfo({
          workspaceId: workspaceId as string,
          userId: pendingAuth?.userId,
          userName: pendingAuth?.userName,
          userAccessToken: pendingAuth?.userToken,
          avatarUrl: pendingAuth?.userAvatarUrl,
          persist: (userInfo) =>
            instagramIntegrationService.updateUserInfo({
              id: integrationRow.id,
              workspaceId: workspaceId as string,
              userInfo,
            }),
        })

        const brandingCtx = await buildContext({
          workspaceId: workspaceId as string,
          integrationType: "instagramFacebook",
          integration: {
            ...integrationRow,
            auth: integrationRow.auth as InstagramAuthValue,
          },
        })

        // Best-effort: the connection is already live, so a failed branding
        // write must never fail the action.
        try {
          await integrationInstagramFacebook.runChannelHandler(
            "bot",
            "addBranding",
            {
              ctx: brandingCtx,
              title: BRANDING_TITLE,
              url: getBrandingUrl("instagram", appUrl),
            },
          )
        } catch (error) {
          logger.warn(
            { err: error },
            "Failed to add branding to Instagram persistent menu",
          )
        }

        // NOTE: the pending-auth cookie is intentionally left to expire on its
        // own (matching the Messenger flow). Deleting it here caused the
        // onboarding select page — which redirects to `/channels/create` when
        // the cookie is absent — to redirect on the post-action re-render,
        // navigating away before the coexist dialog could be shown.
        await updateWorkspaceLogo({
          id: workspaceId as string,
          integration: integrationInstagramFacebook,
          ctx: brandingCtx,
        })

        return {
          integrationId: integrationRow.id,
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
        if (error instanceof SdkException) {
          logger.error({ err: error }, "Failed to connect Facebook page")
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
