"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, isDatabaseError } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import { slugifyUnique } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldRequest,
} from "../schemas/action"
import type { CustomFieldResource } from "../schemas/resource"

export const createCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCustomFieldRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateCustomFieldRequest
      ctx: { user: { id: string } }
    }) => {
      await createCustomField(workspaceId, parsedInput)
      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.CUSTOM_FIELD_CREATED,
        detail: `Campo personalizado "${parsedInput.name}" (${parsedInput.type}) criado`,
      })
    },
  )

export const createCustomField = async (
  workspaceId: string,
  parsedInput: CreateCustomFieldRequest,
): Promise<CustomFieldResource> => {
  if (parsedInput.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, workspaceId, "customField")
  }

  // Gera fieldId slug user-facing único por workspace (paridade Respond.io).
  // Consulta slugs existentes pra evitar colisão; sufixa _2, _3 se preciso.
  const existing = await db
    .select({ fieldId: customFieldModel.fieldId })
    .from(customFieldModel)
    .where(eq(customFieldModel.workspaceId, workspaceId))
  const existingSlugs = new Set(existing.map((r) => r.fieldId))
  const fieldId = slugifyUnique(parsedInput.name, existingSlugs)

  try {
    const newField = await db
      .insert(customFieldModel)
      .values({
        workspaceId,
        fieldId,
        ...parsedInput,
      })
      .returning()
      .then((result) => result[0])

    revalidateCacheTags(`workspaces:${workspaceId}#customFields`)

    return newField
  } catch (error) {
    if (isDatabaseError(error) && error.cause.code === "23505") {
      return returnValidationErrors(createCustomFieldRequest, {
        _errors: ["Exceção de Validação"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw new ChatbotXException("Falha ao criar campo personalizado")
  }
}
