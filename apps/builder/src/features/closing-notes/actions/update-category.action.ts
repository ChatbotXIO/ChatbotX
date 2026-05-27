"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationCategoryModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidatePath } from "next/cache"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateCategoryRequest } from "../schemas/action"

export const updateCategoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()] as const)
  .inputSchema(updateCategoryRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
      ctx: { user },
    } = props

    const [updated] = await db
      .update(conversationCategoryModel)
      .set({
        name: parsedInput.name,
        description: parsedInput.description ?? null,
      })
      .where(
        and(
          eq(conversationCategoryModel.id, id),
          eq(conversationCategoryModel.workspaceId, workspaceId),
        ),
      )
      .returning()

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.CONVERSATION_CATEGORY_UPDATED,
      detail: `Categoria "${parsedInput.name}" atualizada`,
    })

    revalidatePath("/space", "layout")
    return updated
  })
