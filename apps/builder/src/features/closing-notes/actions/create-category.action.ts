"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import { conversationCategoryModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { revalidatePath } from "next/cache"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createCategoryRequest } from "../schemas/action"

export const createCategoryAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCategoryRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props

    const [category] = await db
      .insert(conversationCategoryModel)
      .values({
        id: createId(),
        workspaceId,
        name: parsedInput.name,
        description: parsedInput.description ?? null,
      })
      .returning()

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.CONVERSATION_CATEGORY_CREATED,
      detail: `Categoria "${parsedInput.name}" criada`,
    })

    revalidatePath("/space", "layout")
    return category
  })
