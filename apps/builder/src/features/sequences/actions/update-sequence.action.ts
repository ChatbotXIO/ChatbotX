"use server"

import { auditService } from "@chatbotx.io/business/audit"
import {
  and,
  db,
  eq,
  findOrFail,
  isDatabaseError,
} from "@chatbotx.io/database/client"
import { sequenceModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateSequenceSchema,
  updateSequenceSchema,
} from "../schema/action"

export const updateSequenceAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSequenceSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateSequence(
      {
        workspaceId,
        id,
      },
      parsedInput,
    )
  })

export const updateSequence = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateSequenceSchema,
) => {
  const t = await getTranslations()

  const sequence = await findOrFail({
    table: sequenceModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Sequence not found",
  })

  try {
    const changedEntries = Object.entries(parsedInput).filter(
      ([key, value]) => sequence[key as keyof UpdateSequenceSchema] !== value,
    )

    if (changedEntries.length === 0) {
      return
    }

    const updated = await db
      .update(sequenceModel)
      .set(parsedInput)
      .where(and(eq(sequenceModel.id, ctx.id)))
      .returning({ id: sequenceModel.id })

    if (updated.length === 0) {
      return
    }

    const changedKeys = changedEntries.map(([key]) => key)
    let detail = `updated a sequence (#${sequence.id})`
    if (changedKeys.length === 1 && changedKeys[0] === "active") {
      detail = parsedInput.active
        ? `enabled a sequence (#${sequence.id})`
        : `disabled a sequence (#${sequence.id})`
    }

    await auditService.record({
      workspaceId: ctx.workspaceId,
      action: "update",
      detail,
    })
  } catch (error) {
    if (isDatabaseError(error) && error.cause.code === "23505") {
      return returnValidationErrors(updateSequenceSchema, {
        _errors: [t("sequences.validation.exception")],
        name: {
          _errors: [t("sequences.validation.nameExists")],
        },
      })
    }

    throw new Error("Failed to update sequence")
  }
}
