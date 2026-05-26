"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
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
      ctx: { user },
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateTagSchema
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const updated = await updateTag({ workspaceId, id, parsedInput })
      if (updated && !("validationErrors" in updated)) {
        await logAudit({
          workspaceId,
          userId: user.id,
          action: auditLogActions.TAG_UPDATED,
          detail: `Etiqueta "${parsedInput.name}" atualizada`,
        })
      }
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
      // Cor sempre definida — se o usuário não enviou, mantém a default do schema.
      // Pra emoji/description, undefined = não tocar, null = limpar campo.
      ...(parsedInput.color !== undefined && { color: parsedInput.color }),
      ...(parsedInput.emoji !== undefined && { emoji: parsedInput.emoji }),
      ...(parsedInput.description !== undefined && {
        description: parsedInput.description,
      }),
    })
    .where(eq(tagModel.id, id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`workspaces:${workspaceId}#tags`)

  return updatedTag
}
