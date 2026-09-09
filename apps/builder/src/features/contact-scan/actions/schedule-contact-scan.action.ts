"use server"

import { contactScanService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { getCurrentUser } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requireUnrestrictedContactsScope } from "../lib/require-unrestricted-contacts-scope"
import {
  type ScheduleContactScanRequest,
  type ScheduleContactScanResponse,
  scheduleContactScanRequest,
} from "../schema/action"

type ContactScanFieldName = "inboxId" | "scanFromAt"

/**
 * One localized message per `ChatbotXException.code` `ContactScanService.schedule`
 * (and `requireUnrestrictedContactsScope`) can throw, keyed as a table — not
 * an if/else ladder — so every code has exactly one home. Built from
 * `t()` calls with LITERAL keys (next-intl's generated message types reject
 * a dynamically-interpolated key) once `t` is available, then looked up by
 * `error.code` below. A code absent from both tables falls through to
 * `throw error` (e.g. `requireContactPermissionScope`'s default-coded "not
 * associated with this workspace" / "not authorized" exceptions).
 */
function buildContactScanErrorTables(
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const fieldErrors: Partial<
    Record<string, { field: ContactScanFieldName; message: string }>
  > = {
    contactScanFromTimeInvalid: {
      field: "scanFromAt",
      message: t("contactScan.errors.contactScanFromTimeInvalid"),
    },
    contactScanInboxNotFound: {
      field: "inboxId",
      message: t("contactScan.errors.contactScanInboxNotFound"),
    },
    contactScanChannelUnsupported: {
      field: "inboxId",
      message: t("contactScan.errors.contactScanChannelUnsupported"),
    },
    contactScanIntegrationDisconnected: {
      field: "inboxId",
      message: t("contactScan.errors.contactScanIntegrationDisconnected"),
    },
  }

  const topLevelErrors: Partial<Record<string, string>> = {
    contactScanForbidden: t("contactScan.errors.contactScanForbidden"),
    contactScanCooldown: t("contactScan.errors.contactScanCooldown"),
    contactScanAlreadyRunning: t(
      "contactScan.errors.contactScanAlreadyRunning",
    ),
  }

  return { fieldErrors, topLevelErrors }
}

export const scheduleContactScanAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(scheduleContactScanRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ScheduleContactScanRequest
    }): Promise<ScheduleContactScanResponse> => {
      const user = await getCurrentUser()
      if (!user) {
        return returnValidationErrors(scheduleContactScanRequest, {
          _errors: ["Unauthorized"],
        })
      }

      try {
        await requireUnrestrictedContactsScope(workspaceId)

        return await contactScanService.schedule({
          workspaceId,
          inboxId: parsedInput.inboxId,
          requestedByUserId: user.id,
          scanFromAt: parsedInput.scanFromAt,
        })
      } catch (error) {
        if (error instanceof ChatbotXException) {
          const t = await getTranslations()
          const { fieldErrors, topLevelErrors } = buildContactScanErrorTables(t)

          const fieldError = fieldErrors[error.code]
          if (fieldError) {
            returnValidationErrors(scheduleContactScanRequest, {
              [fieldError.field]: { _errors: [fieldError.message] },
            })
          }

          const topLevelMessage = topLevelErrors[error.code]
          if (topLevelMessage) {
            returnValidationErrors(scheduleContactScanRequest, {
              _errors: [topLevelMessage],
            })
          }
        }
        throw error
      }
    },
  )
