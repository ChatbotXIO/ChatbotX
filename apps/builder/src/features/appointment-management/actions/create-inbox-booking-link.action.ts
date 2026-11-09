"use server"

import {
  conversationService,
  createInboxBookingLink,
  resolveTenantSettings,
  sendInboxBookingLink,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceActionClient } from "@/lib/safe-action"
import { createInboxBookingLinkRequest } from "../schema/action"

export const createInboxBookingLinkAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createInboxBookingLinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    }) => {
      // Member scope applies: an agent limited to assigned conversations gets
      // a 404 for any other conversation, same as the public API.
      const conversation = await assertConversationAccessForCaller(
        {
          workspace: ctx.workspace,
          member: ctx.workspaceMember,
          user: ctx.user,
        },
        conversationId,
      )
      const contactInbox =
        await conversationService.resolveContactInboxForConversation({
          conversation,
          workspaceId,
          inboxId: parsedInput.inboxId,
        })
      const { appUrl } = await resolveTenantSettings({ workspaceId })
      const linkInput = {
        workspaceId,
        conversation,
        contactInbox,
        calendarId: parsedInput.calendarId,
        appUrl,
      }

      if (parsedInput.send) {
        const sent = await sendInboxBookingLink({
          ...linkInput,
          user: ctx.user,
          bypassThreadControlLock: parsedInput.bypassThreadControlLock,
        })
        return {
          url: sent.url,
          expiresAt: sent.expiresAt,
          messageId: sent.message?.id ?? null,
        }
      }

      const link = await createInboxBookingLink(linkInput)
      return { url: link.url, expiresAt: link.expiresAt, messageId: null }
    },
  )
