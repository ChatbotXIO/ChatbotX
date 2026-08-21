import {
  and,
  db,
  eq,
  exists,
  isNotNull,
  isNull,
  ne,
  or,
} from "@chatbotx.io/database/client"
import {
  integrationInstagramModel,
  integrationMessengerModel,
  integrationMetaCatalogModel,
  integrationModel,
  integrationTiktokModel,
  integrationWhatsappModel,
  integrationZaloModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

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
   * Channel integrations whose daily token-refresh cron last failed
   * (`tokenRefreshError` set), across every channel that supports automatic
   * refresh. Used to warn the workspace owner that a channel needs a manual
   * reconnect before it silently stops sending/receiving messages.
   */
  async findTokenRefreshErrorsByWorkspaceId(
    workspaceId: string,
  ): Promise<TokenRefreshErrorIntegration[]> {
    const [zalos, tiktoks, instagrams, messengers, whatsapps] =
      await Promise.all([
        db
          .select({
            id: integrationZaloModel.id,
            name: integrationZaloModel.name,
            error: integrationZaloModel.tokenRefreshError,
          })
          .from(integrationZaloModel)
          .where(
            and(
              eq(integrationZaloModel.workspaceId, workspaceId),
              isNotNull(integrationZaloModel.tokenRefreshError),
            ),
          ),
        db
          .select({
            id: integrationTiktokModel.id,
            name: integrationTiktokModel.name,
            error: integrationTiktokModel.tokenRefreshError,
          })
          .from(integrationTiktokModel)
          .where(
            and(
              eq(integrationTiktokModel.workspaceId, workspaceId),
              isNotNull(integrationTiktokModel.tokenRefreshError),
            ),
          ),
        db
          .select({
            id: integrationInstagramModel.id,
            name: integrationInstagramModel.name,
            error: integrationInstagramModel.tokenRefreshError,
            type: integrationInstagramModel.type,
          })
          .from(integrationInstagramModel)
          .where(
            and(
              eq(integrationInstagramModel.workspaceId, workspaceId),
              isNotNull(integrationInstagramModel.tokenRefreshError),
            ),
          ),
        db
          .select({
            id: integrationMessengerModel.id,
            name: integrationMessengerModel.name,
            error: integrationMessengerModel.tokenRefreshError,
          })
          .from(integrationMessengerModel)
          .where(
            and(
              eq(integrationMessengerModel.workspaceId, workspaceId),
              isNotNull(integrationMessengerModel.tokenRefreshError),
            ),
          ),
        db
          .select({
            id: integrationWhatsappModel.id,
            name: integrationWhatsappModel.name,
            error: integrationWhatsappModel.tokenRefreshError,
          })
          .from(integrationWhatsappModel)
          .where(
            and(
              eq(integrationWhatsappModel.workspaceId, workspaceId),
              isNotNull(integrationWhatsappModel.tokenRefreshError),
            ),
          ),
      ])

    return [
      ...zalos.map((row) => ({
        id: row.id,
        channel: "zalo" as const,
        name: row.name,
        error: row.error as string,
      })),
      ...tiktoks.map((row) => ({
        id: row.id,
        channel: "tiktok" as const,
        name: row.name,
        error: row.error as string,
      })),
      ...instagrams.map((row) => ({
        id: row.id,
        channel:
          row.type === "facebook"
            ? ("instagramFacebook" as const)
            : ("instagram" as const),
        name: row.name,
        error: row.error as string,
      })),
      ...messengers.map((row) => ({
        id: row.id,
        channel: "messenger" as const,
        name: row.name,
        error: row.error as string,
      })),
      ...whatsapps.map((row) => ({
        id: row.id,
        channel: "whatsapp" as const,
        name: row.name,
        error: row.error as string,
      })),
    ]
  }
}

export const integrationService = new IntegrationService()
