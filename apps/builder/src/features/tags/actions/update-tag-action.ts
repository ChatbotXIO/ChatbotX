"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type UpdateTagSchema, updateTagSchema } from "../schema/action"

export const updateTagAction = authActionClient
  .inputSchema(updateTagSchema)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, workspaceId)

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
    throw new Error(`Tag with the name "${parsedInput.name}" already exists.`)
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
