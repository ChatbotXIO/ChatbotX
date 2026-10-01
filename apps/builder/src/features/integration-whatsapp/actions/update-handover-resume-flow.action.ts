"use server"

import { integrationWhatsappService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

const updateHandoverResumeFlowRequest = z.object({
  /** `null` clears the flow (the handover then only shows its context). */
  handoverResumeFlowId: zodBigintAsString().nullable(),
})

const NOT_FOUND_CODE = "notFound"

/**
 * Sets or clears the flow that runs when Meta hands a WhatsApp conversation
 * to this app (conversation routing). Super admin only, like the calling
 * settings; the service checks the flow is an active flow of this workspace.
 * Bound as `.bind(null, workspaceId, integrationWhatsappId)`.
 */
export const updateHandoverResumeFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateHandoverResumeFlowRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
      parsedInput,
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)
      const t = await getTranslations()
      try {
        await integrationWhatsappService.updateHandoverResumeFlow({
          id: integrationWhatsappId,
          workspaceId,
          handoverResumeFlowId: parsedInput.handoverResumeFlowId,
        })
      } catch (error) {
        if (
          error instanceof ChatbotXException &&
          error.code === NOT_FOUND_CODE
        ) {
          throw new ChatbotXException(
            parsedInput.handoverResumeFlowId
              ? t("conversationRouting.settings.flowNotFound")
              : t("conversationRouting.settings.integrationNotFound"),
            NOT_FOUND_CODE,
            404,
          )
        }
        throw error
      }
      return { handoverResumeFlowId: parsedInput.handoverResumeFlowId }
    },
  )
