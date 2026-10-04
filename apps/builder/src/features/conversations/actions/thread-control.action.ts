"use server"

import {
  conversationService,
  type ThreadControlSnapshot,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { requestConversationThreadControl } from "@chatbotx.io/channel-registry/thread-control"
import { threadControlActions } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { workspaceActionClient } from "@/lib/safe-action"
import { mapThreadControlError } from "../lib/thread-control-errors"
import type { ThreadControlRefusal } from "../lib/thread-control-result"

const threadControlActionRequest = z.object({
  contactInboxId: zodBigintAsString(),
  action: threadControlActions,
})

export type ThreadControlActionResult =
  | { status: "applied"; snapshot: ThreadControlSnapshot }
  | ThreadControlRefusal

/**
 * Take, release or pass the routing thread of one of the conversation's
 * contact inboxes (conversation routing). Anyone who can open the
 * conversation may do it: contacts access plus the contact's assigned-only
 * scope, like every other per-contact action.
 *
 * Bound as `.bind(null, workspaceId, conversationId)`. Returns the applied
 * snapshot so the inbox patches its store immediately, or the inline
 * `notEscalation` refusal for a `take` the channel denied.
 */
export const threadControlAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(threadControlActionRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    }): Promise<ThreadControlActionResult> => {
      const t = await getTranslations()
      const conversation = await conversationService.findByOrFail({
        where: { id: conversationId, workspaceId },
      })
      await requireContactAccessForMember({
        permissions: ctx.workspaceMemberPermissions,
        userId: ctx.user.id,
        workspaceId,
        contactId: conversation.contactId,
      })

      try {
        // Refuses a contact inbox that is not one of this conversation's
        // contact, so a caller cannot steer a thread outside their scope.
        const snapshot = await requestConversationThreadControl({
          workspaceId,
          conversation,
          contactInboxId: parsedInput.contactInboxId,
          action: parsedInput.action,
        })
        return { status: "applied", snapshot }
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "notFound") {
          throw notFoundException(t("conversationRouting.errors.notFound"))
        }
        return mapThreadControlError(error, parsedInput.action, t)
      }
    },
  )
