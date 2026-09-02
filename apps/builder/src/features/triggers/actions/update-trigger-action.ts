"use server"

import { auditService, isSameJsonValue } from "@chatbotx.io/business/audit"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conditionModel, triggerModel } from "@chatbotx.io/database/schema"
import { updateTriggerCache } from "@chatbotx.io/events"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { toConditionColumns } from "@/features/conditions/to-condition-columns"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateTriggerSchema } from "../schema/mutation"

export const updateTriggerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateTriggerSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const { conditions, actions } = parsedInput

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
        conditions.filter((c) => "id" in c && c.id).map((c) => c.id),
      )

      const conditionsToDelete = existingConditions.filter(
        (existing) => !submittedIds.has(existing.id.toString()),
      )

      const conditionsToUpdate = conditions.filter(
        (c) => "id" in c && c.id && existingIds.has(c.id),
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

      const conditionsToCreate = conditions.filter((c) => !("id" in c && c.id))

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
      await auditService.record({
        workspaceId,
        action: "update",
        detail: `updated a trigger (#${id})`,
      })
    }

    return result.trigger
  })
