"use server"

import {
  contactInboxService,
  conversationService,
  resolveFreeswitchNode,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  WhatsappCallPendingOutboundExistsError,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  canPerformCallAction,
  getCallPermissions,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { resolveFreeswitchNodes } from "@/lib/freeswitch/nodes"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

/** Meta: business-initiated calling (BIC) is unavailable for +84 (Vietnam) numbers. */
const BIC_UNAVAILABLE_COUNTRY_CODE = "84"

const startCallSchema = z.object({
  conversationId: zodBigintAsString(),
})

const digitsOf = (phoneNumber: string): string => phoneNumber.replace(/\D/g, "")

/**
 * Starts a business-initiated WhatsApp call (outbound flow): checks
 * Meta's call-permissions API, refuses `+84` business numbers (BIC
 * unavailable in Vietnam per Meta docs), then inserts the `WhatsappCall`
 * row BEFORE dialing so the agent's softphone always has a real row to
 * attach to — the partial unique index one-pending-per-contact-inbox turns
 * a duplicate dial into a localized error rather than a second row.
 */
// Authorization model: this repo has no per-inbox permission table — every
// workspace member may act on every inbox (the same `workspaceActionClient`
// gate `createMessageAction` uses for sending), so placing a call is gated
// exactly like sending a message. Tighten here if inbox-level permissions
// are ever introduced (AGENTS.md invariant #18 discusses the visibility gate).
export const startWhatsappCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(startCallSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    const t = await getTranslations()

    const conversation = await conversationService.findBy({
      where: { id: parsedInput.conversationId, workspaceId },
    })
    if (!conversation) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }

    const resolvedContactInbox = await resolveContactInbox({
      contactId: conversation.contactId,
    })
    if (
      !resolvedContactInbox ||
      resolvedContactInbox.channel !== channelTypes.enum.whatsapp
    ) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.notWhatsappConversation"),
      )
    }

    const integration =
      await integrationWhatsappRepository.findByInboxIdForWorkspace({
        workspaceId,
        inboxId: resolvedContactInbox.inboxId,
      })
    if (integration?.sipProvisioningStatus !== "enabled") {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.inAppCallingUnavailable"),
      )
    }
    if (!integration.sipNodeId) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.inAppCallingUnavailable"),
      )
    }

    // Meta's calling FAQ: business-initiated calling is unavailable when the
    // BUSINESS phone number's country is Vietnam (+84); the consumer may be
    // anywhere Cloud API operates. So the check is on our own number, not
    // the contact's. Leading-digits heuristic on the E.164 display number —
    // a false positive only blocks a dial the agent can retry by message.
    const digits = digitsOf(resolvedContactInbox.sourceId)
    const businessDigits = digitsOf(integration.displayPhoneNumber)
    if (businessDigits.startsWith(BIC_UNAVAILABLE_COUNTRY_CODE)) {
      throw new ChatbotXException(t("whatsapp.calls.errors.bicUnavailable"))
    }

    const permissions = await getCallPermissions(
      integration.auth as WhatsappAuthValue,
      digits,
    ).catch((error: unknown) => {
      logger.error(
        { err: error, integrationId: integration.id },
        "Failed to read WhatsApp call permissions",
      )
      return null
    })
    if (!(permissions && canPerformCallAction(permissions, "start_call"))) {
      throw new ChatbotXException(t("whatsapp.calls.errors.noCallPermission"))
    }

    const node = resolveFreeswitchNode(
      resolveFreeswitchNodes(),
      integration.sipNodeId,
    )
    const attemptId = createId()

    try {
      const call = await whatsappCallRepository.createPendingOutbound({
        attemptId,
        workspaceId,
        inboxId: resolvedContactInbox.inboxId,
        contactInboxId: resolvedContactInbox.id,
        conversationId: conversation.id,
      })

      return {
        attemptId,
        callId: call.id,
        dialUri: `sip:+${digits}@${node.sipDomain}`,
      }
    } catch (error) {
      if (error instanceof WhatsappCallPendingOutboundExistsError) {
        throw new ChatbotXException(
          t("whatsapp.calls.errors.callAlreadyInProgress"),
        )
      }
      throw error
    }
  })

/**
 * Narrows `contactInboxService.findBy` to the fields this action needs.
 * Scoped by `contactId` + `channel: whatsapp` only (mirrors
 * `requestCallPermissionAction`'s lookup) — a conversation has no
 * `inboxId` of its own; the WhatsApp number comes from the contact's
 * `ContactInbox` row.
 */
async function resolveContactInbox(input: { contactId: string }): Promise<{
  id: string
  inboxId: string
  channel: string
  sourceId: string
} | null> {
  const contactInbox = await contactInboxService.findBy({
    where: {
      contactId: input.contactId,
      channel: channelTypes.enum.whatsapp,
    },
  })
  if (!contactInbox) {
    return null
  }
  return {
    id: contactInbox.id,
    inboxId: contactInbox.inboxId,
    channel: contactInbox.channel,
    sourceId: contactInbox.sourceId,
  }
}
