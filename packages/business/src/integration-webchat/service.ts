import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { inboxService } from "../inbox/service"
import { assertDeletable } from "../template/installed-resource.service"
import { workspaceService } from "../workspace"

export type CreateWebchatRequest = {
  name: string
  auth: Record<string, unknown>
  enable: boolean
  authorizedDomains: string[]
  conversationStarters: unknown[]
  persistentMenus: unknown[]
  brandColor: string
  hideHeader: boolean
  showLogo: boolean
  hideMessageInput: boolean
  customCss: string | null
  welcomeFlowId?: string | null
}

class IntegrationWebchatService {
  /**
   * Provisions a new Inbox + IntegrationWebchat row together, mirroring
   * `createWebchatAction` (`apps/builder/src/features/integration-webchat/
   * actions/create-webchat.action.ts`) — a pre-minted id doubles as both the
   * IntegrationWebchat row id and the Inbox's `sourceId`. Webchat is not
   * linked to an external platform, so unlike other channels there is no
   * real external id to dedup on; the self-referential id keeps `Inbox`'s
   * `(workspaceId, channel, sourceId)` unique constraint satisfied.
   *
   * Callers installing from a template MUST catch
   * `channelLimitReachedException` specifically (thrown by
   * `inboxService.create` when the target workspace's channel quota is
   * exhausted) and degrade to a per-webchat warn+skip — never let it abort
   * the whole install transaction.
   */
  async create(
    props: {
      workspaceId: string
      ownerId: string
      data: CreateWebchatRequest
    },
    tx: DatabaseClient,
  ): Promise<IntegrationWebchatModel> {
    const { workspaceId, ownerId, data } = props
    const webchatId = createId()

    const { inbox } = await inboxService.create({
      tx,
      ownerId,
      data: {
        id: webchatId,
        workspaceId,
        channel: "webchat",
        name: data.name,
        sourceId: webchatId,
      },
    })

    const [created] = await tx
      .insert(integrationWebchatModel)
      .values({
        id: webchatId,
        workspaceId,
        inboxId: inbox.id,
        auth: data.auth,
        name: data.name,
        enable: data.enable,
        authorizedDomains: data.authorizedDomains,
        conversationStarters: data.conversationStarters as never,
        persistentMenus: data.persistentMenus as never,
        brandColor: data.brandColor,
        hideHeader: data.hideHeader,
        showLogo: data.showLogo,
        hideMessageInput: data.hideMessageInput,
        customCss: data.customCss,
        welcomeFlowId: data.welcomeFlowId ?? null,
      })
      .returning()

    return created
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const [integrationWebchat, workspace] = await Promise.all([
      findOrFail({
        table: integrationWebchatModel,
        where: { workspaceId: input.workspaceId, id: input.id },
        message: "Integration Webchat not found",
      }),
      workspaceService.findById({ id: input.workspaceId }),
    ])

    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "integrationWebchat",
      resourceIds: [input.id],
    })

    await db.transaction(async (tx) => {
      await tx
        .delete(integrationWebchatModel)
        .where(eq(integrationWebchatModel.id, integrationWebchat.id))

      await inboxService.disconnect({
        inboxId: integrationWebchat.inboxId,
        ownerId: workspace.ownerId,
        workspaceId: input.workspaceId,
        tx,
      })
    })
  }
}

export const integrationWebchatService = new IntegrationWebchatService()
