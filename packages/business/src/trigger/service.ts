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

    const deletedTriggers = await db.query.triggerModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.ids } },
      columns: { id: true },
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

    if (deletedTriggers.length > 0) {
      await this.audit(
        "delete",
        `deleted trigger${deletedTriggers.length > 1 ? "s" : ""} (${deletedTriggers.map((trigger) => `#${trigger.id}`).join(", ")})`,
      )
    }
  }
}

export const triggerService = new TriggerService()
