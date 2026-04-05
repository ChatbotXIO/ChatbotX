"use server"

import {
  and,
  db,
  eq,
  findOrFail,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateReflinkRequest,
  updateReflinkRequest,
} from "../schemas/action"

export const updateReflinkAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateReflinkRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateReflink(
      {
        workspaceId,
        id,
      },
      parsedInput,
    )
  })

export const updateReflink = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateReflinkRequest,
) => {
  const reflink = await findOrFail({
    table: reflinkModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Reflink not found",
  })
  try {
    await db
      .update(reflinkModel)
      .set(parsedInput)
      .where(and(eq(reflinkModel.id, reflink.id)))

    revalidateCacheTags(`workspaces:${ctx.workspaceId}#reflinks`)
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return returnValidationErrors(updateReflinkRequest, {
        _errors: ["Validation Exception"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw error
  }
}
