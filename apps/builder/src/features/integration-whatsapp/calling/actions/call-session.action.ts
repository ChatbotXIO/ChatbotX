"use server"

import {
  contactInboxService,
  whatsappLivekitService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  whatsappCallPermissionRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const wacidSchema = z.object({ wacid: z.string().min(1) })

/**
 * Issues the LiveKit join token for an agent picking up a ringing WhatsApp
 * call from the inbox. The room was correlated to the call by the LiveKit
 * webhook (SIP participant attributes) before the ringing event fired.
 */
export const answerWhatsappCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(wacidSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId], ctx }) => {
    const t = await getTranslations()
    if (!whatsappLivekitService.isInAppCallingConfigured()) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.inAppCallingUnavailable"),
      )
    }

    const call = await whatsappCallRepository.findByWacid(parsedInput.wacid)
    if (!call || call.workspaceId !== workspaceId) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }
    if (!call.livekitRoomName) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotReady"))
    }

    const { token, url } = await whatsappLivekitService.createAgentToken({
      roomName: call.livekitRoomName,
      identity: `agent-${ctx.user.id}`,
      displayName: ctx.user.name ?? undefined,
    })

    return { token, url, roomName: call.livekitRoomName }
  })

/** Ends the call for everyone (removes the SIP leg → WhatsApp hangs up). */
export const hangupWhatsappCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(wacidSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    const t = await getTranslations()
    const call = await whatsappCallRepository.findByWacid(parsedInput.wacid)
    if (!call || call.workspaceId !== workspaceId) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }
    if (call.livekitRoomName) {
      await whatsappLivekitService.endCall(call.livekitRoomName)
    }
  })

const startCallSchema = z.object({
  contactInboxId: zodBigintAsString(),
})

/**
 * Business-initiated call (beta): dials the customer through the LiveKit
 * SIP outbound trunk after verifying an unexpired call-permission grant.
 * The WhatsappCall row itself is created by Meta's `calls` webhook once the
 * call connects; room correlation relies on the trunk's header→attribute
 * mapping (see docs/whatsapp-calling.md).
 */
export const startWhatsappCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(startCallSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId], ctx }) => {
    const t = await getTranslations()
    if (!whatsappLivekitService.isOutboundCallingConfigured()) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.inAppCallingUnavailable"),
      )
    }

    const contactInbox = await contactInboxService.findBy({
      where: { id: parsedInput.contactInboxId },
    })
    if (!contactInbox || contactInbox.channel !== channelTypes.enum.whatsapp) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.notWhatsappConversation"),
      )
    }
    // Tenant scoping: the inbox behind this contact must be a WhatsApp
    // number owned by the caller's workspace.
    const integration =
      await integrationWhatsappRepository.findWorkspaceIntegrationByInboxId({
        workspaceId,
        inboxId: contactInbox.inboxId,
      })
    if (!integration) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }

    const permission =
      await whatsappCallPermissionRepository.findByContactInboxId(
        contactInbox.id,
      )
    const isGranted =
      permission?.response === "accept" &&
      (permission.isPermanent ||
        (permission.expiresAt !== null && permission.expiresAt > new Date()))
    if (!isGranted) {
      throw new ChatbotXException(t("whatsapp.calls.errors.noCallPermission"))
    }

    const roomName = `wacall-out-${createId()}`
    await whatsappLivekitService.startOutboundCall({
      roomName,
      phoneNumber: contactInbox.sourceId,
    })
    const { token, url } = await whatsappLivekitService.createAgentToken({
      roomName,
      identity: `agent-${ctx.user.id}`,
      displayName: ctx.user.name ?? undefined,
    })

    return { token, url, roomName }
  })
