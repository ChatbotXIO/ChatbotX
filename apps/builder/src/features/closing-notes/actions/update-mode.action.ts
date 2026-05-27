"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { revalidatePath } from "next/cache"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateClosingNotesModeRequest } from "../schemas/action"

export const updateClosingNotesModeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateClosingNotesModeRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props

    await db
      .update(workspaceModel)
      .set({ closingNotesMode: parsedInput.mode })
      .where(eq(workspaceModel.id, workspaceId))

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.CLOSING_NOTES_MODE_UPDATED,
      detail: `Modo de Notas de Fechamento alterado para "${parsedInput.mode}"`,
    })

    revalidatePath("/space", "layout")
  })
