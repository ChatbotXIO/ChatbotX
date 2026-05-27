"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { count, db, eq } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  createSavedReplyRequest,
  MAX_SNIPPETS_PER_WORKSPACE,
} from "../schema/mutation"

export const createSavedReplyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSavedReplyRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props

    // Paridade Respond.io (gap #12 — 2026-05-27): limite 5000/workspace.
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(savedReplyModel)
      .where(eq(savedReplyModel.workspaceId, workspaceId))
    if (total >= MAX_SNIPPETS_PER_WORKSPACE) {
      throw new ChatbotXException(
        `Limite de ${MAX_SNIPPETS_PER_WORKSPACE} snippets por workspace atingido.`,
      )
    }

    const savedReply = await db
      .insert(savedReplyModel)
      .values({
        id: createId(),
        workspaceId,
        name: parsedInput.name ?? null,
        shortcut: parsedInput.shortcut,
        text: parsedInput.text,
        topics: parsedInput.topics ?? [],
        files: parsedInput.files ?? [],
      })
      .returning()
      .then((result) => result[0])

    revalidateCacheTags(`workspaces:${workspaceId}#savedReplies`)

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.SNIPPET_CREATED,
      detail: `Trecho "${parsedInput.name ?? parsedInput.shortcut}" criado`,
    })

    return savedReply
  })
