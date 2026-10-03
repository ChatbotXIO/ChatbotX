"use server"

import { conversationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { callingActionClient } from "@/lib/safe-action"
import { requestWhatsappCallPermission } from "../lib/request-call-permission"
import { assertCallAccessOrThrow } from "./assert-call-access"

const requestCallPermissionSchema = z.object({
  text: z.string().trim().min(1).max(1024),
  /**
   * The inbox backing the conversation the agent is viewing. Required to pin
   * the send to that WhatsApp number — a contact can have ContactInbox rows on
   * several connected numbers, and an unscoped lookup could resolve (and bill
   * Meta's per-customer request limits against) a different one.
   */
  inboxId: zodBigintAsString().optional(),
})

/**
 * Sends Meta's `call_permission_request` interactive into a WhatsApp
 * conversation from the inbox (see `requestWhatsappCallPermission`).
 */
export const requestCallPermissionAction = callingActionClient
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

      // Mirrors the outbound-dial gate — an assigned-only agent must not send a
      // permission request on another agent's conversation.
      await assertCallAccessOrThrow({
        workspaceId,
        conversationId,
        userId: ctx.user.id,
      })

      await requestWhatsappCallPermission({
        workspaceId,
        conversation,
        text: parsedInput.text,
        inboxId: parsedInput.inboxId,
        user: ctx.user,
        messages: {
          notWhatsappConversation: t(
            "whatsapp.calls.errors.notWhatsappConversation",
          ),
          notFound: t("whatsapp.calls.errors.notFound"),
          permissionCheckFailed: t(
            "whatsapp.calls.outbound.permissionCheckFailed",
          ),
          permissionRequestLimitReached: t(
            "whatsapp.calls.errors.permissionRequestLimitReached",
          ),
        },
      })
    },
  )
