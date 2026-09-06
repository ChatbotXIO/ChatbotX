import { db } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { resolveTenantSettings } from "../platform/settings"
import { workspaceService } from "../workspace/service"

type MessengerPersistentMenu = {
  label: string
  type: "url"
  url: string
}

/**
 * DB-only body of the Messenger page-select connect: optionally creates the
 * workspace, resolves the tenant's `appUrl`, then inserts the
 * `IntegrationMessenger` row via `connectChannelIntegration`. The Meta API
 * calls (`exchangeLongLivedToken`, `subscribePageToAppWebhook`,
 * persona/branding) stay in the builder action — `packages/business` has no
 * dependency on `@chatbotx.io/integration-messenger`.
 *
 * `buildPersistentMenus` is a pure callback (no external deps) so the
 * branding-menu shape — which needs `getBrandingUrl` from a builder-only
 * feature module — can still be built with the `appUrl` resolved inside this
 * transaction.
 */
export async function connectMessengerPage(input: {
  ownerId: string
  userId: string
  workspaceId?: string | null
  pageName: string
  pageId: string
  auth: unknown
  buildPersistentMenus: (appUrl: string) => MessengerPersistentMenu[]
}): Promise<{
  workspaceId: string
  createdWorkspace: boolean
  integrationRow: IntegrationMessengerModel
  wasCreated: boolean
  appUrl: string
}> {
  return await db.transaction(async (tx) => {
    let workspaceId = input.workspaceId
    let createdWorkspace = false

    if (!workspaceId) {
      const workspace = await workspaceService.create({
        tx,
        createdBy: input.userId,
        data: {
          name: input.pageName,
          timezone: "UTC",
          ownerId: input.userId,
        },
      })
      workspaceId = workspace.id
      createdWorkspace = true
    }

    const { appUrl } = await resolveTenantSettings({ workspaceId, tx })

    const { integration: integrationRow, wasCreated } =
      await connectChannelIntegration({
        tx,
        ownerId: input.ownerId,
        inboxData: {
          id: createId(),
          workspaceId,
          name: input.pageName,
          channel: "messenger",
          sourceId: input.pageId,
        },
        insertIntegration: async (inboxId) =>
          tx
            .insert(integrationMessengerModel)
            .values({
              id: createId(),
              workspaceId: workspaceId as string,
              inboxId,
              pageId: input.pageId,
              auth: input.auth,
              name: input.pageName,
              persistentMenus: input.buildPersistentMenus(appUrl),
              conversationStarters: [],
              personas: [],
            })
            .returning()
            .then((result) => result[0]),
      })

    if (!integrationRow) {
      throw new Error("Failed to create Messenger integration")
    }

    return {
      workspaceId,
      createdWorkspace,
      integrationRow,
      wasCreated,
      appUrl,
    }
  })
}
