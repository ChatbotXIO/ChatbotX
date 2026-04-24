"use server"

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
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils/id"
import { organizationService } from "@/features/organization/services"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { getDomainFromHeader } from "@/lib/domain"
import { ChatbotXException } from "@/lib/errors/exception"
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
        const instagramSettings = organization.settings.instagram
        if (!instagramSettings) {
          throw new ChatbotXException("Instagram App settings not found")
        }

        await db.transaction(async (tx) => {
          if (!workspaceId) {
            const workspace = await createSimpleWorkspace(
              tx,
              ctx.user.id,
              organization,
              {
                name: parsedInput.igName,
                timezone: "UTC",
                organizationId: organization.id,
              },
            )
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

          await tx.insert(integrationInstagramModel).values({
            id: createId(),
            workspaceId,
            inboxId: inbox.id,
            igId: parsedInput.igId,
            pageId: parsedInput.pageId,
            auth,
            name: parsedInput.igName,
            username: parsedInput.igUsername,
            persistentMenus: [],
            conversationStarters: [],
          })
        })

        revalidateCacheTags([
          `workspaces:${workspaceId}#instagram`,
          `workspaces:${workspaceId}#inboxes`,
        ])

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
