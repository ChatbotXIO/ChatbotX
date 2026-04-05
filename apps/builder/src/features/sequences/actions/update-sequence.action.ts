"use server"

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
import { revalidateCacheTags } from "@/lib/cache-helper"
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

  await findOrFail({
    table: sequenceModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Sequence not found",
  })

  try {
    await db
      .update(sequenceModel)
      .set(parsedInput)
      .where(and(eq(sequenceModel.id, ctx.id)))
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

  revalidateCacheTags([`workspaces:${ctx.workspaceId}#sequences`])
}
