import {
  and,
  db,
  eq,
  exists,
  isNull,
  ne,
  or,
} from "@chatbotx.io/database/client"
import {
  integrationMetaCatalogModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { connectionStateService } from "../connection/state-service"

export type TokenRefreshErrorChannel =
  | "zalo"
  | "tiktok"
  | "instagram"
  | "instagramFacebook"
  | "messenger"
  | "whatsapp"

export type TokenRefreshErrorIntegration = {
  id: string
  channel: TokenRefreshErrorChannel
  name: string
  error: string
}

class IntegrationService extends BaseService {
  findByIdForWorkspace(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationModel | undefined> {
    return db.query.integrationModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  async listByWorkspaceId(workspaceId: string): Promise<IntegrationModel[]> {
    return await db
      .select()
      .from(integrationModel)
      .where(
        and(
          eq(integrationModel.workspaceId, workspaceId),
          or(
            ne(integrationModel.integrationType, "metaCatalog"),
            exists(
              db
                .select({ id: integrationMetaCatalogModel.id })
                .from(integrationMetaCatalogModel)
                .where(
                  and(
                    eq(
                      integrationMetaCatalogModel.integrationId,
                      integrationModel.id,
                    ),
                    isNull(integrationMetaCatalogModel.deletedAt),
                  ),
                ),
            ),
          ),
        ),
      )
  }

  /**
   * Channel integrations whose token-refresh last failed — delegates to
   * `connectionStateService.list` (the `Connection` domain now owns
   * `needs_reauth`/`degraded` status), filtered to the channels that
   * actually auto-refresh, and mapped back onto this method's original DTO
   * so the layout banner (`TokenRefreshErrorDialog`) is unchanged.
   */
  async findTokenRefreshErrorsByWorkspaceId(
    workspaceId: string,
  ): Promise<TokenRefreshErrorIntegration[]> {
    const autoRefreshChannels = new Set<TokenRefreshErrorChannel>([
      "zalo",
      "tiktok",
      "instagram",
      "instagramFacebook",
      "messenger",
      "whatsapp",
    ])
    const { data } = await connectionStateService.list({
      workspaceId,
      kind: "channel",
      status: ["needs_reauth", "degraded"],
    })
    return data.flatMap((connection) => {
      if (
        !(
          autoRefreshChannels.has(
            connection.provider as TokenRefreshErrorChannel,
          ) && connection.lastError
        )
      ) {
        return []
      }
      return [
        {
          id: connection.id,
          channel: connection.provider as TokenRefreshErrorChannel,
          name: connection.displayName,
          error: connection.lastError,
        },
      ]
    })
  }

  /**
   * Boolean gate for whether a workspace has any integration whose type is
   * in `integrationTypes` (e.g. an AI provider). The caller supplies the
   * type list — business does not depend on `@chatbotx.io/ai`.
   */
  async hasIntegrationOfTypes(props: {
    workspaceId: string
    integrationTypes: string[]
  }): Promise<boolean> {
    const existing = await db.query.integrationModel.findFirst({
      where: {
        integrationType: { in: props.integrationTypes },
        workspaceId: props.workspaceId,
      },
    })

    return !!existing
  }
}

export const integrationService = new IntegrationService()
