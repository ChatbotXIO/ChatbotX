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
}

export const integrationService = new IntegrationService()
