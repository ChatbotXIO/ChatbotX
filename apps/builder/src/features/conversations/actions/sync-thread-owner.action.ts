"use server"

import {
  conversationService,
  type ThreadControlSnapshot,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { syncConversationThreadOwner } from "@chatbotx.io/channel-registry/thread-control"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { workspaceActionClient } from "@/lib/safe-action"

const syncThreadOwnerRequest = z.object({
  contactInboxId: zodBigintAsString(),
  conversationId: zodBigintAsString(),
})

export type SyncThreadOwnerActionResult = {
  status: "synced"
  snapshot: ThreadControlSnapshot
}

/**
 * On-demand "who owns this thread?" check (conversation routing): asks the
 * contact's channel for the current owner and reconciles the stored routing
 * state with it. Same access gate as `threadControlAction` (contacts access
 * plus the contact's assigned-only scope). A channel without an owner query
 * (WhatsApp) leaves the stored state alone, so the current snapshot comes back
 * unchanged.
 *
 * Bound as `.bind(null, workspaceId)`. Returns the snapshot so the inbox
 * patches its store immediately; a channel failure surfaces as the action's
 * server error (a toast), never as a stale "synced".
 */
export const syncThreadOwnerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(syncThreadOwnerRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx,
    }): Promise<SyncThreadOwnerActionResult> => {
      const t = await getTranslations()
      const conversation = await conversationService.findByOrFail({
        where: { id: parsedInput.conversationId, workspaceId },
      })
      await requireContactAccessForMember({
        permissions: ctx.workspaceMemberPermissions,
        userId: ctx.user.id,
        workspaceId,
        contactId: conversation.contactId,
      })

      try {
        // Fresh (uncached) row of a contact inbox of THIS conversation's
        // contact; a foreign contact inbox is not reachable.
        const snapshot = await syncConversationThreadOwner({
          workspaceId,
          conversation,
          contactInboxId: parsedInput.contactInboxId,
        })
        return { status: "synced", snapshot }
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "notFound") {
          throw notFoundException(t("conversationRouting.errors.notFound"))
        }
        throw error
      }
    },
  )
