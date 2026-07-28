"use server"

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
      const existingConditions = await tx.query.conditionModel.findMany({
        where: {
          triggerId: id,
        },
      })

      const existingIds = new Set(existingConditions.map((c) => c.id))
      const submittedIds = new Set(
        conditions.filter((c) => "id" in c && c.id).map((c) => c.id),
      )

      const conditionsToDelete = existingConditions.filter(
        (existing) => !submittedIds.has(existing.id.toString()),
      )

      const conditionsToUpdate = conditions.filter(
        (c) => "id" in c && c.id && existingIds.has(c.id),
      )

      const conditionsToCreate = conditions.filter((c) => !("id" in c && c.id))

      await tx
        .update(triggerModel)
        .set({ actions })
        .where(
          and(
            eq(triggerModel.workspaceId, workspaceId),
            eq(triggerModel.id, id),
          ),
        )

      if (conditionsToDelete.length > 0) {
        await tx.delete(conditionModel).where(
          inArray(
            conditionModel.id,
            conditionsToDelete.map((c) => c.id),
          ),
        )
      }

      for (const condition of conditionsToUpdate) {
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

      return await tx.query.triggerModel.findFirst({
        where: {
          id,
        },
      })
    })

    await updateTriggerCache(workspaceId)

    return result
  })
