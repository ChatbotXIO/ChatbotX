"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationCategoryModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidatePath } from "next/cache"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteCategoryAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()] as const)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx: { user },
    } = props

    const [deleted] = await db
      .delete(conversationCategoryModel)
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
      action: auditLogActions.CONVERSATION_CATEGORY_DELETED,
      detail: `Categoria "${deleted?.name ?? id}" deletada`,
    })

    revalidatePath("/space", "layout")
    return deleted
  })
