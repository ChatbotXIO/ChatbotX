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
  integrationInstagramModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
  exchangeLongLivedToken,
  integration as integrationInstagram,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils/id"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { getDomainFromHeader } from "@/lib/domain"
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

        const domain = await getDomainFromHeader()
        const organization = await organizationService.findByDomain(domain)
        const instagramCredential =
          await organizationCredentialService.findDecrypted({
            organizationId: organization.id,
            type: "instagram",
          })
        if (!instagramCredential) {
          throw new ChatbotXException("Instagram App settings not found")
        }
        const instagramSettings = instagramCredential.config

        const { appUrl } = await resolvePlatformSettings({
          organizationId: organization.id,
        })

        await db.transaction(async (tx) => {
          if (!workspaceId) {
            const workspace = await workspaceService.create({
              tx,
              createdBy: ctx.user.id,
              organization,
              data: {
                name: parsedInput.igName,
                timezone: "UTC",
                organizationId: organization.id,
              },
            })
            workspaceId = workspace.id
          }

          const longLivedToken = await exchangeLongLivedToken(
            instagramSettings,
            parsedInput.accessToken,
          )

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

          const inbox = await tx
            .insert(inboxModel)
            .values({
              id: createId(),
              workspaceId,
              name: parsedInput.igName,
              channel: "instagram",
              sourceId: parsedInput.igId,
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
            .insert(integrationInstagramModel)
            .values({
              id: createId(),
              workspaceId,
              inboxId: inbox.id,
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
            .then((result) => result[0])

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
        })

        return {
          workspaceId,
        }
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          throw new ChatbotXException("Instagram account already connected")
        }

        logger.error(error, "Failed to connect Instagram account")
        throw new ChatbotXException("Failed to connect Instagram account")
      }
    },
  )
