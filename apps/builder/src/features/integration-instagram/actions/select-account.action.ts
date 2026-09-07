"use server"

import {
  buildContext,
  connectInstagramAccount,
  instagramIntegrationService,
  platformCredentialService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isDatabaseError } from "@chatbotx.io/database/client"
import type { UserModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
  integration as integrationInstagram,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { AuthType } from "@chatbotx.io/sdk"
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
} from "../schema/action"

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

        // NOTE (behavior change / PR-recorded deviation): the webhook
        // subscribe and branding call used to run INSIDE the same DB
        // transaction as the insert. Moving the connect's DB body into
        // `connectInstagramAccount` (packages/business has no dependency on
        // `@chatbotx.io/integration-instagram`) forces both out of the
        // transaction. The webhook subscribe now runs BEFORE the write so a
        // failed subscribe still prevents the connect (nothing to roll back,
        // nothing orphaned) — same shape as the Messenger select-page action.
        // Branding stays best-effort after the write. See
        // `apps/builder/__tests__/instagram-select-account-ordering.test.ts`.
        await subscribePageToInstagramWebhook({
          igId: parsedInput.pageId,
          accessToken: parsedInput.accessToken,
          version: instagramSettings.version,
        })

        const {
          workspaceId: connectedWorkspaceId,
          appUrl,
          createdWorkspace,
          integrationRow,
          wasCreated,
        } = await connectInstagramAccount({
          ownerId,
          userId: ctx.user.id,
          workspaceId,
          igId: parsedInput.igId,
          igName: parsedInput.igName,
          igUsername: parsedInput.igUsername,
          pageId: parsedInput.pageId,
          auth,
          buildPersistentMenus: (resolvedAppUrl) => [
            {
              label: BRANDING_TITLE,
              type: "url" as const,
              url: getBrandingUrl("instagram", resolvedAppUrl),
            },
          ],
        })

        workspaceId = connectedWorkspaceId
        const integrationId = integrationRow.id

        const brandingCtx = await buildContext({
          workspaceId,
          integrationType: "instagram",
          integration: {
            ...integrationRow,
            auth: integrationRow.auth as InstagramAuthValue,
          },
        })

        // Best-effort: the connection is already live, so a failed branding
        // write must never fail the action.
        try {
          await integrationInstagram.runChannelHandler("bot", "addBranding", {
            ctx: brandingCtx,
            title: BRANDING_TITLE,
            url: getBrandingUrl("instagram", appUrl),
          })
        } catch (error) {
          logger.warn(
            { err: error },
            "Failed to add branding to Instagram persistent menu",
          )
        }

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

        if (createdWorkspace) {
          await auditService.record({
            userId: ctx.user.id,
            workspaceId: workspaceId as string,
            action: "create",
            detail: `created the workspace (#${workspaceId})`,
          })
        }

        if (wasCreated) {
          await auditService.record({
            workspaceId: workspaceId as string,
            action: "connect",
            detail: `connected a new Instagram channel (#${integrationId})`,
          })
        }

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
