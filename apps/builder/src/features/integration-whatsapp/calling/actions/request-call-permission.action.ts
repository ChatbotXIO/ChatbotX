"use server"

import { contactInboxService, conversationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { MessageWhatsappCallPermissionRequestEntity } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { createMessage } from "@/features/messages/actions/create-message.action"
import { workspaceActionClient } from "@/lib/safe-action"

const requestCallPermissionSchema = z.object({
  text: z.string().trim().min(1).max(1024),
})

/**
 * Sends Meta's `call_permission_request` interactive into a WhatsApp
 * conversation from the inbox. The customer's answer flows back as a
 * `call_permission_reply` and is persisted per contact
 * (WhatsappCallPermission) — the state future business-initiated calls gate
 * on. Subject to Meta's per-customer request limits (1/24h, 2/7 days).
 */
export const requestCallPermissionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(requestCallPermissionSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, conversationId],
      ctx,
    }) => {
      const t = await getTranslations()
      const conversation = await conversationService.findByOrFail({
        where: { id: conversationId, workspaceId },
      })

      const contactInbox = await contactInboxService.findBy({
        where: {
          contactId: conversation.contactId,
          channel: channelTypes.enum.whatsapp,
        },
      })
      if (!contactInbox) {
        throw new ChatbotXException(
          t("whatsapp.calls.errors.notWhatsappConversation"),
        )
      }

      const entity: MessageWhatsappCallPermissionRequestEntity = {
        type: "whatsapp_call_permission_request",
      }

      return await createMessage({
        conversation,
        contactInbox,
        parsedInput: { text: parsedInput.text },
        user: ctx.user,
        contentAttributes: entity,
      })
    },
  )
