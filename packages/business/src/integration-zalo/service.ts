import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationZaloModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"

export type ConnectZaloInput = {
  tx: DatabaseClient
  ownerId: string
  workspaceId: string
  oaId: string
  oaName: string
  auth: Record<string, unknown>
}

class ZaloIntegrationService extends BaseService {
  listByWorkspaceId(
    where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>,
  ) {
    return db.query.integrationZaloModel.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
  }

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationZaloModel.findFirst({ where: { workspaceId } })
  }

  /**
   * Returns `wasCreated: false` (no insert performed) when the OA is already
   * connected elsewhere — the caller (app layer) decides whether to redirect;
   * `redirect()` must not be called from inside a service.
   */
  async connect(
    input: ConnectZaloInput,
  ): Promise<{ integrationId: string | undefined; wasCreated: boolean }> {
    let connectedIntegrationId: string | undefined

    const { wasCreated } = await connectChannelIntegration({
      tx: input.tx,
      ownerId: input.ownerId,
      inboxData: {
        workspaceId: input.workspaceId,
        name: input.oaName,
        channel: "zalo",
        sourceId: input.oaId,
      },
      insertIntegration: async (inboxId, insertWasCreated) => {
        if (!insertWasCreated) {
          return
        }
        const [row] = await input.tx
          .insert(integrationZaloModel)
          .values({
            inboxId,
            workspaceId: input.workspaceId,
            oaId: input.oaId,
            auth: input.auth,
            name: input.oaName,
          })
          .returning({ id: integrationZaloModel.id })
        connectedIntegrationId = row?.id
      },
    })

    return { integrationId: connectedIntegrationId, wasCreated }
  }

  async disconnect(props: { id: string; tx: DatabaseClient }) {
    // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
    await props.tx
      .delete(tagChannelModel)
      .where(
        and(
          eq(tagChannelModel.channelType, channelTypes.enum.zalo),
          eq(tagChannelModel.integrationId, props.id),
        ),
      )
    await props.tx
      .delete(integrationZaloModel)
      .where(eq(integrationZaloModel.id, props.id))
  }

  async updateTagSync(props: {
    workspaceId: string
    integrationId: string
    enabled: boolean
  }) {
    await db
      .update(integrationZaloModel)
      .set({ syncTagEnabledAt: props.enabled ? new Date() : null })
      .where(
        and(
          eq(integrationZaloModel.id, props.integrationId),
          eq(integrationZaloModel.workspaceId, props.workspaceId),
        ),
      )
  }
  async findAll(): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
  }

  async findAllByWorkspaceIds(
    workspaceIds: string[],
  ): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    if (workspaceIds.length === 0) {
      return []
    }
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
      .where(inArray(integrationZaloModel.workspaceId, workspaceIds))
  }

  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration Zalo not found",
    })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  async updateAuth(
    id: string,
    auth: Record<string, unknown>,
    name?: string,
  ): Promise<void> {
    await db
      .update(integrationZaloModel)
      .set({ auth, tokenRefreshError: null, ...(name ? { name } : {}) })
      .where(eq(integrationZaloModel.id, id))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationZaloModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationZaloModel.id, id))
  }

  /**
   * Load a Zalo integration by OA id with NO workspace scope — used by
   * inbound webhooks (e.g. inbox-label sync) that only have the OA id and
   * have not yet resolved a workspace.
   */
  findByOaId(props: { oaId: string }) {
    return db.query.integrationZaloModel.findFirst({
      where: { oaId: props.oaId },
    })
  }
}

export const zaloIntegrationService = new ZaloIntegrationService()
