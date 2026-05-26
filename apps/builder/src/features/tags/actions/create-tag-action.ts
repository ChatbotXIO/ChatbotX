"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { type CreateTagRequest, createTagRequest } from "../schema/action"

export const createTagAction = workspaceActionClient
  .inputSchema(createTagRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      parsedInput,
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: CreateTagRequest
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const result = await createTag({ workspaceId, ...parsedInput })
      if ("data" in result && result.data) {
        await logAudit({
          workspaceId,
          userId: user.id,
          action: auditLogActions.TAG_CREATED,
          detail: `Etiqueta "${result.data.name}" criada`,
        })
      }
      return result
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
      syncToMessenger: parsedInput.syncToMessenger ?? true,
      id: createId(),
    })
    .returning()
    .then((result) => result[0])

  return {
    data: newTag,
  }
}
