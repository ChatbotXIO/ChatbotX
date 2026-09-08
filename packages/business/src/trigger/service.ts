import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import type { FolderType } from "@chatbotx.io/database/partials"
import { triggerModel } from "@chatbotx.io/database/schema"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { removeTriggerCache, updateTriggerCache } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { validationException } from "../errors"
import { folderService } from "../folder/service"
import { assertDeletable } from "../template/installed-resource.service"
import { MAX_TRIGGERS_PER_WORKSPACE } from "./constants"

class TriggerService extends BaseService {
  async create(input: {
    workspaceId: string
    data: Omit<
      typeof triggerModel.$inferInsert,
      "id" | "workspaceId" | "actions"
    > & { folderId?: string | null }
    folderType: FolderType
  }): Promise<TriggerModel> {
    const { workspaceId, data, folderType } = input

    const existingTriggersCount = await db.$count(
      triggerModel,
      eq(triggerModel.workspaceId, workspaceId),
    )
    if (existingTriggersCount >= MAX_TRIGGERS_PER_WORKSPACE) {
      throw validationException("_", "validation.maxItemsReached", {
        max: MAX_TRIGGERS_PER_WORKSPACE,
        feature: "triggers",
      })
    }

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType,
      })
    }

    const [created] = await db
      .insert(triggerModel)
      .values({
        id: createId(),
        ...data,
        actions: [],
        workspaceId,
      })
      .returning()

    await updateTriggerCache(workspaceId)

    await this.audit("create", `created a new trigger (#${created.id})`)

    return created
  }

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
