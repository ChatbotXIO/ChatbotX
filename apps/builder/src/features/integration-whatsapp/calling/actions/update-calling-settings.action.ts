"use server"

import { buildContext, integrationWhatsappService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { WhatsappCallingSettings } from "@chatbotx.io/integration-whatsapp/api/calling"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { integrations } from "@/integration"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWhatsappCallingSettingsSchema,
  updateWhatsappCallingSettingsSchema,
} from "../schemas/update-calling-settings-schema"

export const updateWhatsappCallingSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWhatsappCallingSettingsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      parsedInput: UpdateWhatsappCallingSettingsSchema
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      // Calling settings affect Meta billing (business-initiated calls are
      // paid) — gate on super admin like connect/reconnect, not mere
      // membership.
      await assertWorkspaceSuperAdmin(workspaceId)
      const integrationWhatsapp =
        await integrationWhatsappService.findWorkspaceIntegration({
          id: integrationWhatsappId,
          workspaceId,
        })
      if (!integrationWhatsapp) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }

      const data: Partial<WhatsappCallingSettings> = {}
      if (parsedInput.status) {
        data.status = parsedInput.status
      }
      if (parsedInput.callIconVisibility) {
        data.call_icon_visibility = parsedInput.callIconVisibility
      }
      if (parsedInput.callbackPermissionStatus) {
        data.callback_permission_status = parsedInput.callbackPermissionStatus
      }

      const ctx = await buildContext({
        workspaceId,
        integrationType: "whatsapp",
        integration: {
          ...integrationWhatsapp,
          auth: integrationWhatsapp.auth as WhatsappAuthValue,
        },
      })
      await integrations.whatsapp.runAction("updateCallingSettings", {
        ctx,
        data,
      })
    },
  )
