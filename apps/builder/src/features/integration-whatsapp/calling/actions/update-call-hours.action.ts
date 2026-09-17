"use server"

import { buildContext, integrationWhatsappService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { integrations } from "@/integration"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { throwWhatsappApiActionError } from "../../libs/whatsapp-api-action-error"
import { toMetaCallHours, upcomingHolidays } from "../lib/call-hours"
import {
  type CallHoursFormValues,
  callHoursFormSchema,
} from "../schemas/call-hours-schema"

/**
 * Saves a number's weekly call hours on Meta. Meta replaces `call_hours`
 * wholesale and deletes any holiday schedule the request leaves out, and this
 * form does not edit holidays — so the current holidays are read from Meta at
 * save time and sent back, minus the ones already past (Meta rejects those).
 * If they cannot be read, nothing is written.
 */
export const updateWhatsappCallHoursAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(callHoursFormSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      parsedInput: CallHoursFormValues
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      // Same gate as the other calling settings: they change how the number
      // behaves for every customer.
      await assertWorkspaceSuperAdmin(workspaceId)
      const integrationWhatsapp =
        await integrationWhatsappService.findWorkspaceIntegration({
          id: integrationWhatsappId,
          workspaceId,
        })
      if (!integrationWhatsapp) {
        throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
      }
      const auth = integrationWhatsapp.auth as WhatsappAuthValue

      let current: WhatsappCallingSettings
      try {
        current = await getCallingSettings(auth)
      } catch {
        throw new ChatbotXException(t("whatsapp.calls.errors.updateFailed"))
      }

      const callHours = toMetaCallHours(
        parsedInput,
        upcomingHolidays(
          current.call_hours?.holiday_schedule,
          parsedInput.timezoneId,
        ),
      )

      const ctx = await buildContext({
        workspaceId,
        integrationType: "whatsapp",
        integration: { ...integrationWhatsapp, auth },
      })
      try {
        await integrations.whatsapp.runAction("updateCallingSettings", {
          ctx,
          data: { call_hours: callHours },
        })
      } catch (error) {
        throwWhatsappApiActionError(
          error,
          t("whatsapp.calls.errors.updateFailed"),
        )
      }
    },
  )
