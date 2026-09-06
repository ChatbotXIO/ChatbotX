import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conditionModel, triggerModel } from "@chatbotx.io/database/schema"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { removeTriggerCache, updateTriggerCache } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { folderService } from "../folder/service"
import { assertDeletable } from "../template/installed-resource.service"
import {
  type ConditionInput,
  toConditionColumnsShared as toConditionColumns,
} from "./condition-columns"

export type { ConditionInput } from "./condition-columns"

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

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    return await db.$count(
      triggerModel,
      eq(triggerModel.workspaceId, workspaceId),
    )
  }

  async create(input: {
    workspaceId: string
    name: string
    folderId?: string | null
    [key: string]: unknown
  }): Promise<TriggerModel> {
    const { workspaceId, folderId, ...triggerData } = input

    if (folderId) {
      await folderService.ensureExists({
        id: folderId,
        workspaceId,
        folderType: "trigger",
      })
    }

    const result = await db
      .insert(triggerModel)
      .values({
        id: createId(),
        ...triggerData,
        folderId,
        actions: [],
        workspaceId,
      })
      .returning()
      .then((rows) => rows[0])

    await updateTriggerCache(workspaceId)

    await this.audit("create", `created a new trigger (#${result.id})`)

    return result
  }

  /**
   * Replaces a trigger's `actions` and diffs its `conditions` (delete/update/
   * create) in one transaction. Audit and cache-invalidation only fire when
   * something actually changed (`hasRealChange`) — a submit with no real
   * delta is a silent no-op, matching the original action verbatim.
   */
  async updateWithConditions(input: {
    workspaceId: string
    id: string
    actions: TriggerModel["actions"]
    conditions: ConditionInput[]
  }): Promise<TriggerModel | undefined> {
    const { workspaceId, id, actions, conditions } = input

    const result = await db.transaction(async (tx) => {
      const [existingTrigger, existingConditions] = await Promise.all([
        tx.query.triggerModel.findFirst({
          where: {
            id,
            workspaceId,
          },
        }),
        tx.query.conditionModel.findMany({
          where: {
            triggerId: id,
          },
        }),
      ])

      if (!existingTrigger) {
        return { trigger: undefined, hasRealChange: false }
      }

      const existingIds = new Set(existingConditions.map((c) => c.id))
      const existingById = new Map(existingConditions.map((c) => [c.id, c]))
      const submittedIds = new Set(
        conditions.filter((c) => c.id).map((c) => c.id),
      )

      const conditionsToDelete = existingConditions.filter(
        (existing) => !submittedIds.has(existing.id.toString()),
      )

      const conditionsToUpdate = conditions.filter(
        (c) => c.id && existingIds.has(c.id),
      )

      const changedConditionsToUpdate = conditionsToUpdate.filter(
        (condition) => {
          const existing = condition.id
            ? existingById.get(condition.id)
            : undefined
          if (!existing) {
            return false
          }
          const next = toConditionColumns(condition)
          return !isSameJsonValue(next, {
            type: existing.type,
            sourceId: existing.sourceId,
            operator: existing.operator,
            value: existing.value,
          })
        },
      )

      const conditionsToCreate = conditions.filter((c) => !c.id)

      let actionsChanged = false
      if (!isSameJsonValue(actions, existingTrigger.actions)) {
        const updated = await tx
          .update(triggerModel)
          .set({ actions })
          .where(
            and(
              eq(triggerModel.workspaceId, workspaceId),
              eq(triggerModel.id, id),
            ),
          )
          .returning({ id: triggerModel.id })

        actionsChanged = updated.length > 0
      }

      if (conditionsToDelete.length > 0) {
        await tx.delete(conditionModel).where(
          inArray(
            conditionModel.id,
            conditionsToDelete.map((c) => c.id),
          ),
        )
      }

      for (const condition of changedConditionsToUpdate) {
        await tx
          .update(conditionModel)
          .set(toConditionColumns(condition))
          .where(eq(conditionModel.id, condition.id ?? ""))
      }

      if (conditionsToCreate.length > 0) {
        await tx.insert(conditionModel).values(
          conditionsToCreate.map((c) => ({
            id: createId(),
            triggerId: id,
            ...toConditionColumns(c),
          })),
        )
      }

      const trigger = await tx.query.triggerModel.findFirst({
        where: {
          id,
        },
      })

      return {
        trigger,
        hasRealChange:
          actionsChanged ||
          conditionsToDelete.length > 0 ||
          changedConditionsToUpdate.length > 0 ||
          conditionsToCreate.length > 0,
      }
    })

    if (result.trigger) {
      await updateTriggerCache(workspaceId)
    }

    if (result.hasRealChange) {
      await this.audit("update", `updated a trigger (#${id})`)
    }

    return result.trigger
  }

  /**
   * Applies a settings patch (`name`/`active`) after diffing against the
   * current row — a no-op submit returns early without writing or auditing.
   * The audit detail branches to `enabled`/`disabled` when the only change
   * is `active` flipping, otherwise a generic `updated` detail.
   */
  async updateSettings(input: {
    workspaceId: string
    id: string
    name?: string
    active?: boolean
  }): Promise<void> {
    const { workspaceId, id, ...patch } = input

    const trigger = await db.query.triggerModel.findFirst({
      where: {
        id,
        workspaceId,
      },
    })

    if (!trigger) {
      throw notFoundException("Trigger not found")
    }

    const changedEntries = Object.entries(patch).filter(
      ([key, value]) => trigger[key as keyof typeof patch] !== value,
    )

    if (changedEntries.length === 0) {
      return
    }

    const updated = await db
      .update(triggerModel)
      .set(patch)
      .where(eq(triggerModel.id, trigger.id))
      .returning({ id: triggerModel.id })

    if (updated.length === 0) {
      return
    }

    const changedKeys = changedEntries.map(([key]) => key)
    let detail = `updated a trigger (#${trigger.id})`
    if (changedKeys.length === 1 && changedKeys[0] === "active") {
      detail = patch.active
        ? `enabled a trigger (#${trigger.id})`
        : `disabled a trigger (#${trigger.id})`
    }

    await this.audit("update", detail)
  }
}

export const triggerService = new TriggerService()
