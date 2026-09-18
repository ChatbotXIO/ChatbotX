"use server"

import {
  contactInboxService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { MessageWhatsappCallPermissionRequestEntity } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { callingActionClient } from "@/lib/safe-action"
import {
  canSendCallPermissionRequest,
  readMetaCallPermissions,
} from "../lib/meta-call-permission"
import { assertCallAccessOrThrow } from "./assert-call-access"
import { resolveDialIdentity } from "./outbound-dial-target"

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
 * conversation from the inbox. The customer's answer flows back as a
 * `call_permission_reply` and is persisted per contact (WhatsappCallPermission)
 * — the state future business-initiated calls gate on. Subject to Meta's per-
 * customer request limits (1/24h, 2/7 days).
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

      // Prefer the caller's `inboxId` to pin the send to the number the agent
      // is viewing (a contact can have WhatsApp ContactInbox rows on several
      // connected numbers). Falls back to a contact + channel lookup when that
      // pin finds nothing, so a stale/missing client `inboxId` can't dead-end
      // an actual WhatsApp conversation with a false "not on WhatsApp" — the
      // outbound call flow (`resolveOutboundCallModeAction`) resolves the same
      // way.
      const contactInbox =
        (parsedInput.inboxId
          ? await contactInboxService.findBy({
              where: {
                contactId: conversation.contactId,
                channel: channelTypes.enum.whatsapp,
                inboxId: parsedInput.inboxId,
              },
            })
          : null) ??
        (await contactInboxService.findBy({
          where: {
            contactId: conversation.contactId,
            channel: channelTypes.enum.whatsapp,
          },
        }))
      if (!contactInbox) {
        throw new ChatbotXException(
          t("whatsapp.calls.errors.notWhatsappConversation"),
        )
      }

      // Meta caps these at 1 per 24 hours and 2 per 7 days per consumer and
      // reports the remaining budget on the action itself, so the check is
      // against Meta's own counter rather than a second one that could drift
      // from it. Has to happen HERE: the send below is enqueued, so Meta's
      // rejection surfaces in the worker as a failed message the agent is never
      // shown a reason for — and two agents on the same thread would otherwise
      // each spend one of the two.
      const integration =
        await integrationWhatsappRepository.findByInboxIdForWorkspace({
          workspaceId,
          inboxId: contactInbox.inboxId,
        })
      if (!integration) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }

      const { permissionTarget } = resolveDialIdentity(contactInbox)
      const permissions = await readMetaCallPermissions({
        auth: integration.auth as WhatsappAuthValue,
        integrationId: integration.id,
        contactInboxId: contactInbox.id,
        target: permissionTarget,
      })
      // Fail closed on an unreadable lookup, mirroring the dial gate in
      // `initiate-outbound-voip-call.action.ts`: a GET that never ran is not
      // evidence of remaining budget, and the budget it would spend is two
      // requests per week with no way to get them back. Only successes are
      // cached, so retrying a minute later re-reads Meta.
      if (!permissions) {
        throw new ChatbotXException(
          t("whatsapp.calls.outbound.permissionCheckFailed"),
        )
      }
      if (!canSendCallPermissionRequest(permissions)) {
        throw new ChatbotXException(
          t("whatsapp.calls.errors.permissionRequestLimitReached"),
        )
      }

      const entity: MessageWhatsappCallPermissionRequestEntity = {
        type: "whatsapp_call_permission_request",
      }

      // The channel send is enqueued, not awaited — Meta is contacted later in
      // the chat worker. So a Meta 138017 ("permanent permission already
      // exists") can never surface here; that case is reconciled in the worker
      // (`reconcileCallPermissionAlreadyGranted`).
      await messageService.createOutgoing({
        conversation,
        contactInbox,
        input: { text: parsedInput.text, contentAttributes: entity },
        user: ctx.user,
      })
    },
  )
