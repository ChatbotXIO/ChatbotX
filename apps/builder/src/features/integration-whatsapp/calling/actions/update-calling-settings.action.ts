"use server"

import {
  buildContext,
  integrationWhatsappService,
  WhatsappCallTranscriptionRequiresRecordingError,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import type { WhatsappCallingSettings } from "@chatbotx.io/integration-whatsapp/api/calling"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { integrations } from "@/integration"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { callingAdminActionClient } from "@/lib/safe-action"
import { throwWhatsappApiActionError } from "../../libs/whatsapp-api-action-error"
import { invalidateCallingSettingsCache } from "../lib/calling-settings-cache"
import {
  type UpdateWhatsappCallingSettingsSchema,
  updateWhatsappCallingSettingsSchema,
} from "../schemas/update-calling-settings-schema"

export const updateWhatsappCallingSettingsAction = callingAdminActionClient
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
        inboundCallsEnabled: boolean
        callingEnabled: boolean
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
      if (parsedInput.inboundCallsEnabled !== undefined) {
        localValues.inboundCallsEnabled = parsedInput.inboundCallsEnabled
      }
      // Persisting the mirror is one write, and it happens only once the whole
      // save is known to have succeeded — a partial save that committed the
      // local toggles and then hit a Meta refusal would leave the database
      // saying one thing and Meta another, with the card rolled back to a
      // third.
      const persist = async (values: typeof localValues) => {
        try {
          await integrationWhatsappService.updateCallSettings({
            id: integrationWhatsappId,
            workspaceId,
            values,
          })
        } catch (error) {
          if (
            error instanceof WhatsappCallTranscriptionRequiresRecordingError
          ) {
            throw new ChatbotXException(
              t("whatsapp.calls.errors.transcriptionRequiresRecording"),
            )
          }
          throw error
        }
      }

      // A pure local toggle needs no Meta round-trip.
      if (Object.keys(data).length === 0) {
        await persist(localValues)
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

      // Everything below runs ONLY after Meta accepted the change. Writing the
      // mirror first would let a refused update leave the number reporting
      // calling as on while Meta still has it off — and the inbound gate reads
      // the mirror, so that lie would ring agents for a disabled number.
      try {
        await persist(
          parsedInput.status
            ? {
                ...localValues,
                callingEnabled: parsedInput.status === "ENABLED",
              }
            : localValues,
        )
      } catch (error) {
        // Meta already committed, so this is not an ordinary failed save: the
        // two sides now disagree, and the dangerous direction is a number Meta
        // has ENABLED whose mirror still says disabled — the gate would refuse
        // every inbound call. Say so plainly instead of reporting a generic
        // failure; saving again re-sends the same values and heals it.
        if (error instanceof ChatbotXException) {
          throw error
        }
        logger.error(
          { err: error, workspaceId, integrationWhatsappId },
          "Whatsapp calling: Meta accepted the settings but the local mirror write failed",
        )
        throw new ChatbotXException(t("whatsapp.calls.errors.savedOnMetaOnly"))
      }

      // The inbox reads these settings through a cache, so without this the
      // call button keeps the old answer for the whole TTL while the settings
      // page already shows the new one.
      await invalidateCallingSettingsCache(integrationWhatsappId)
    },
  )
