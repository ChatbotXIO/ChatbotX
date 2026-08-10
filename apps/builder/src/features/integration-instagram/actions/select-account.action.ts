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
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
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
import { persistIntegrationUserInfo } from "@/lib/integration-user-info"
import { logger } from "@/lib/log"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
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

        const ownerId = await resolvePlatformOwnerId({
          userId: ctx.user.id,
          workspaceId: parsedInput.workspaceId,
        })
        const instagramCredential =
          await platformCredentialService.resolveForOwner({
            ownerId,
            type: "instagram",
          })
        if (!instagramCredential) {
          throw new ChatbotXException("Instagram App settings not found")
        }
        const instagramSettings = instagramCredential.config

        const { brandingCtx, integrationId } = await db.transaction(
          async (tx) => {
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

            await subscribePageToInstagramWebhook({
              igId: parsedInput.pageId,
              accessToken: parsedInput.accessToken,
              version: instagramSettings.version,
            })

            const auth: InstagramAuthValue = {
              authType: AuthType.oauth2,
              clientId: instagramSettings.clientId,
              clientSecret: instagramSettings.clientSecret,
              redirectUrl: "",
              tokens: {
                accessToken: parsedInput.accessToken,
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

            // Best-effort: the connection is already live, so a failed
            // branding write must never roll back the transaction or fail
            // the action.
            try {
              await integrationInstagram.runChannelHandler(
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

            return { brandingCtx, integrationId: integrationRow.id }
          },
        )

        // Best-effort: the connection is already live, so a failed user-info
        // write must never fail the action. Direct Instagram login
        // authenticates as the account itself, so the account IS the user;
        // igId/igName/profilePictureUrl were already resolved by the account
        // picker, so no extra Graph API call is needed here.
        await persistIntegrationUserInfo({
          workspaceId: workspaceId as string,
          userId: parsedInput.igId,
          userName: parsedInput.igName,
          userAccessToken: parsedInput.accessToken,
          avatarUrl: parsedInput.profilePictureUrl,
          persist: (userInfo) =>
            instagramIntegrationService.updateUserInfo({
              id: integrationId,
              workspaceId: workspaceId as string,
              userInfo,
            }),
        })

        await updateWorkspaceLogo({
          id: workspaceId as string,
          integration: integrationInstagram,
          ctx: brandingCtx,
        })

        return {
          integrationId,
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
