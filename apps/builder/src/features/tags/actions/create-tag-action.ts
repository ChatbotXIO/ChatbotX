"use server"

import { db } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type CreateTagRequest, createTagRequest } from "../schema/action"

export const createTagAction = authActionClient
  .inputSchema(createTagRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      ctx: { user: UserModel }
      parsedInput: CreateTagRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, workspaceId)

      return await createTag({ workspaceId, ...parsedInput })
    },
  )

export const createTag = async (
  parsedInput: CreateTagRequest & { workspaceId: string },
) => {
  const existingTag = await db.query.tagModel.findFirst({
    columns: {
      id: true,
    },
    where: {
      name: parsedInput.name,
      workspaceId: parsedInput.workspaceId,
    },
  })
  if (existingTag) {
    throw new Error(`Tag with the name "${parsedInput.name}" already exists.`)
  }

  if (parsedInput.folderId) {
    await ensureFolderIsExists(
      parsedInput.folderId,
      parsedInput.workspaceId,
      "tag",
    )
  }

  const newTag = await db
    .insert(tagModel)
    .values({
      ...parsedInput,
      folderId: parsedInput.folderId ?? null,
      syncToMessenger: parsedInput.syncToMessenger ?? true,
      id: createId(),
    })
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`workspaces:${parsedInput.workspaceId}#tags`)

  return {
    data: newTag,
  }
}
