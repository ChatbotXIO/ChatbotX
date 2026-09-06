import { db } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { resolveTenantSettings } from "../platform/settings"
import { workspaceService } from "../workspace/service"

type InstagramPersistentMenu = {
  label: string
  type: "url"
  url: string
}

/**
 * DB-only body of both Instagram account-select connects (native login and
 * Facebook-mediated): optionally creates the workspace, resolves the
 * tenant's `appUrl`, then inserts the `IntegrationInstagram` row via
 * `connectChannelIntegration`. All Meta API calls (webhook subscribe,
 * branding) stay in the builder action — `packages/business` has no
 * dependency on `@chatbotx.io/integration-instagram(-facebook)`.
 *
 * `buildPersistentMenus` is a pure callback (no external deps) so the
 * branding-menu shape — which needs `getBrandingUrl` from a builder-only
 * feature module — can still be built with the `appUrl` resolved inside this
 * transaction.
 */
export async function connectInstagramAccount(input: {
  ownerId: string
  userId: string
  workspaceId?: string | null
  igId: string
  igName: string
  igUsername: string
  pageId: string
  auth: unknown
  type?: "facebook"
  buildPersistentMenus: (appUrl: string) => InstagramPersistentMenu[]
}): Promise<{
  workspaceId: string
  createdWorkspace: boolean
  integrationRow: IntegrationInstagramModel
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
          name: input.igName,
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
          name: input.igName,
          channel: "instagram",
          sourceId: input.igId,
        },
        insertIntegration: async (inboxId) =>
          tx
            .insert(integrationInstagramModel)
            .values({
              id: createId(),
              workspaceId: workspaceId as string,
              inboxId,
              igId: input.igId,
              pageId: input.pageId,
              auth: input.auth,
              name: input.igName,
              username: input.igUsername,
              ...(input.type ? { type: input.type } : {}),
              persistentMenus: input.buildPersistentMenus(appUrl),
              conversationStarters: [],
            })
            .returning()
            .then((result) => result[0]),
      })

    if (!integrationRow) {
      throw new Error("Failed to create Instagram integration")
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
