"use server"

import { auditLogActions, logAudit, mergeContacts } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type MergeContactsRequest,
  mergeContactsRequest,
} from "../schemas/merge"

export const mergeContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(mergeContactsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: MergeContactsRequest
      ctx: { user: { id: string } }
    }) => {
      const result = await mergeContacts({
        workspaceId,
        primaryId: parsedInput.primaryId,
        duplicateIds: parsedInput.duplicateIds,
        actorUserId: user.id,
      })

      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.CONTACT_MERGED,
        detail: `Contato ${result.primaryId} recebeu merge de ${result.mergedCount} duplicata(s): ${result.mergedIds.join(", ")}`,
      })

      revalidateCacheTags([
        `workspaces:${workspaceId}#contacts`,
        `workspaces:${workspaceId}#conversations`,
      ])

      return result
    },
  )
