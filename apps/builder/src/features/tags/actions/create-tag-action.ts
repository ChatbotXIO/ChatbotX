"use server"

import { tagSyncService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateTagRequest, createTagRequest } from "../schema/action"

export const createTagAction = workspaceActionClient
  .inputSchema(createTagRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: CreateTagRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => await createTag({ workspaceId, ...parsedInput }),
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
      deletedAt: { isNull: true as const },
    },
  })
  if (existingTag) {
    return returnValidationErrors(createTagRequest, {
      name: {
        _errors: ["Name is already taken."],
      },
    })
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
      id: createId(),
    })
    .returning()
    .then((result) => result[0])

  if (newTag) {
    await tagSyncService.enqueueCreate({
      workspaceId: parsedInput.workspaceId,
      tagId: newTag.id,
    })
  }

  return {
    data: newTag,
  }
}
