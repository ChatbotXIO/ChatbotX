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
import { throwWhatsappApiActionError } from "../../libs/whatsapp-api-action-error"
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

      const localValues: Partial<{
        callRecordingEnabled: boolean
        callRecordingRetentionDays: number
        callTranscriptionEnabled: boolean
      }> = {}
      if (parsedInput.recordingEnabled !== undefined) {
        localValues.callRecordingEnabled = parsedInput.recordingEnabled
      }
      if (parsedInput.callRecordingRetentionDays !== undefined) {
        localValues.callRecordingRetentionDays =
          parsedInput.callRecordingRetentionDays
      }
      if (parsedInput.callTranscriptionEnabled !== undefined) {
        localValues.callTranscriptionEnabled =
          parsedInput.callTranscriptionEnabled
      }
      await integrationWhatsappService.updateCallSettings({
        id: integrationWhatsappId,
        workspaceId,
        values: localValues,
      })

      // A pure local toggle needs no Meta round-trip.
      if (Object.keys(data).length === 0) {
        return
      }

      const ctx = await buildContext({
        workspaceId,
        integrationType: "whatsapp",
        integration: {
          ...integrationWhatsapp,
          auth: integrationWhatsapp.auth as WhatsappAuthValue,
        },
      })
      try {
        await integrations.whatsapp.runAction("updateCallingSettings", {
          ctx,
          data,
        })
      } catch (error) {
        // Meta explains the refusal (messaging tier too low, coexistence
        // number, …) in `error_user_msg` — surface that instead of a label.
        throwWhatsappApiActionError(
          error,
          t("whatsapp.calls.errors.updateFailed"),
        )
      }
    },
  )
