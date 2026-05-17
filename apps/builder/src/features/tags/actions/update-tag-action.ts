"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { type UpdateTagSchema, updateTagSchema } from "../schema/action"

export const updateTagAction = workspaceActionClient
  .inputSchema(updateTagSchema)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await updateTag({ workspaceId, id, parsedInput })
    },
  )

export const updateTag = async ({
  workspaceId,
  id,
  parsedInput,
}: {
  workspaceId: string
  id: string
  parsedInput: UpdateTagSchema
}) => {
  const existingTag = await db.query.tagModel.findFirst({
    columns: {
      id: true,
    },
    where: {
      name: parsedInput.name,
      workspaceId,
      id: {
        ne: id,
      },
    },
  })
  if (existingTag) {
    return returnValidationErrors(updateTagSchema, {
      name: {
        _errors: ["Name is already taken."],
      },
    })
  }

  const updatedTag = await db
    .update(tagModel)
    .set({
      name: parsedInput.name,
    })
    .where(eq(tagModel.id, id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`workspaces:${workspaceId}#tags`)

  return updatedTag
}
