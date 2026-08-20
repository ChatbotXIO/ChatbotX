import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { removeTriggerCache } from "@chatbotx.io/events"
import { BaseService } from "../base.service"
import { assertDeletable } from "../template/installed-resource.service"

class TriggerService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<TriggerModel[]> {
    return await db
      .select()
      .from(triggerModel)
      .where(eq(triggerModel.workspaceId, workspaceId))
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "trigger",
      resourceIds: input.ids,
    })

    await db
      .delete(triggerModel)
      .where(
        and(
          eq(triggerModel.workspaceId, input.workspaceId),
          inArray(triggerModel.id, input.ids),
        ),
      )

    await removeTriggerCache(input.workspaceId)
  }
}

export const triggerService = new TriggerService()
