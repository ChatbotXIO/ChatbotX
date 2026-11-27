"use server"

import { contactSyncService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import type { z } from "zod"
import {
  type WorkspaceIdAndIdRequestParams,
  type WorkspaceIdRequestParams,
  workspaceIdAndIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { requireContactSyncAdmin } from "../lib/access"
import {
  createContactSyncPublicRequest,
  saveContactSyncMappingsPublicRequest,
} from "../schema/public"

/**
 * One localized message per `ChatbotXException.code` the service can throw,
 * as a table of literal keys. A code absent from it is rethrown as is.
 */
const buildErrorMessages = (t: Awaited<ReturnType<typeof getTranslations>>) =>
  ({
    contactSyncAlreadyRunning: t("contactSync.errors.alreadyRunning"),
    contactSyncCooldown: t("contactSync.errors.cooldown"),
    contactSyncNoSources: t("contactSync.errors.noSources"),
    contactSyncTooManySources: t("contactSync.errors.tooManySources"),
    contactSyncDuplicateSource: t("contactSync.errors.sourceNotEligible"),
    contactSyncSourceNotFound: t("contactSync.errors.sourceNotEligible"),
    contactSyncSourceNotEligible: t("contactSync.errors.sourceNotEligible"),
    contactSyncSourceUnavailable: t("contactSync.errors.sourceUnavailable"),
    contactSyncNotConfigured: t("contactSync.errors.notConfigured"),
    contactSyncMappingInvalid: t("contactSync.errors.mappingInvalid"),
    contactSyncNotAdmin: t("contactSync.errors.forbidden"),
    contactScanForbidden: t("contactSync.errors.forbidden"),
  }) as Partial<Record<string, string>>

/** The localized message for a known service error, `null` for any other error. */
const localizedErrorMessage = async (error: unknown): Promise<string | null> =>
  error instanceof ChatbotXException
    ? (buildErrorMessages(await getTranslations())[error.code] ?? null)
    : null

export const startContactSyncAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createContactSyncPublicRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: z.infer<typeof createContactSyncPublicRequest>
    }) => {
      try {
        const { userId } = await requireContactSyncAdmin(workspaceId)
        const run = await contactSyncService.schedule({
          workspaceId,
          actor: { type: "user", id: userId },
          triggerSource: "app",
          sources: parsedInput.sources,
          syncTags: parsedInput.syncTags,
          syncCustomFields: parsedInput.syncCustomFields,
          overwriteExisting: parsedInput.overwriteExisting,
        })
        return { runId: run.id }
      } catch (error) {
        const message = await localizedErrorMessage(error)
        if (message) {
          returnValidationErrors(createContactSyncPublicRequest, {
            _errors: [message],
          })
        }
        throw error
      }
    },
  )

/** Allowed after trial expiry: stopping work must always be possible. */
export const cancelContactSyncAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, runId],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await requireContactSyncAdmin(workspaceId)
      return await contactSyncService.cancel({ workspaceId, runId })
    },
  )

export const saveContactSyncMappingsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(saveContactSyncMappingsPublicRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: z.infer<typeof saveContactSyncMappingsPublicRequest>
    }) => {
      try {
        const { userId } = await requireContactSyncAdmin(workspaceId)
        await contactSyncService.saveMappings({
          workspaceId,
          actor: { type: "user", id: userId },
          ...parsedInput,
        })
      } catch (error) {
        const message = await localizedErrorMessage(error)
        if (message) {
          returnValidationErrors(saveContactSyncMappingsPublicRequest, {
            _errors: [message],
          })
        }
        throw error
      }
    },
  )
