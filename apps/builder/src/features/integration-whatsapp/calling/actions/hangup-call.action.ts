"use server"

import { freeswitchApiClient } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const hangupSchema = z.object({
  callId: zodBigintAsString(),
})

/**
 * Ends an in-progress WhatsApp call from the inbox: resolves the
 * workspace-scoped row, then kills whichever FreeSWITCH leg is live
 * (`freeswitchBLegUuid` once bridged, else the A-leg `freeswitchUuid`) via
 * the node's ESL API — the BYE this generates reaches Meta and the
 * `CHANNEL_HANGUP_COMPLETE` event finalizes the row on the worker side.
 */
export const hangupWhatsappCallAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(hangupSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [workspaceId] }) => {
    const t = await getTranslations()
    const call = await whatsappCallRepository.findById(parsedInput.callId)
    if (!call || call.workspaceId !== workspaceId) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }

    const uuid = call.freeswitchBLegUuid ?? call.freeswitchUuid
    if (!uuid) {
      // Nothing dialed yet (still resolving the attempt) — nothing to kill.
      return
    }

    const integration =
      await integrationWhatsappRepository.findByInboxIdForWorkspace({
        workspaceId,
        inboxId: call.inboxId,
      })
    const nodeId = integration?.sipNodeId
    if (!nodeId) {
      throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
    }

    await freeswitchApiClient.run(nodeId, { kind: "uuidKill", uuid })
  })
