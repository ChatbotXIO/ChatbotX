"use server"

import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { inboxStatuses } from "@chatbotx.io/database/partials"
import {
  inboxModel,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  exchangeLongLivedToken,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import { AuthType } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { verifyOrganizationSettings } from "@/features/organization/queries"
import { createSimpleWorkspace } from "@/features/workspaces/actions/create-workspace-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
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
        const { organization } =
          await identifyChatbotAndOrganizationFromRequest(
            parsedInput.workspaceId,
          )
        const settings = await verifyOrganizationSettings(organization)
        const messengerSettings = settings.messenger
        if (!messengerSettings) {
          throw new ChatbotXException("Messenger settings not found")
        }

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
            const workspace = await createSimpleWorkspace(
              tx,
              ctx.user.id,
              organization,
              {
                name: parsedInput.pageName,
                timezone: "UTC",
                organizationId: organization.id,
              },
            )
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
              target: [inboxModel.channel, inboxModel.sourceId],
              set: {
                status: inboxStatuses.enum.connected,
              },
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationMessengerModel).values({
            id: createId(),
            workspaceId,
            inboxId: inbox.id,
            pageId: parsedInput.pageId,
            auth,
            name: parsedInput.pageName,
            greetingMessages: [],
            persistentMenus: [],
            conversationStarters: [],
            personas: [],
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
