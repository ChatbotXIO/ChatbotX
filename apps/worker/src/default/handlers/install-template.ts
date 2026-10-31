import { templateInstallService, templateService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import type { Job } from "bullmq"
import { runLeasedTemplateJob } from "../../lib/run-leased-template-job"
import { enqueueInstalledAiFiles } from "./template-ai-files"

type InstallTemplateData = {
  installationId: string
  workspaceId: string
}

const UNKNOWN_INSTALL_ERROR_CODE = "templateInstallFailed"

/**
 * Not under `handlers/imports/` — a share-link install has its own
 * `TemplateInstallation` status surface, never touching the `Import` table
 * (`Import.fileId` is `notNull()` with `onDelete: "restrict"`, and a
 * share-link install has no file).
 *
 * The row is the outbox: the handler claims it with a lease first, so a
 * redelivered or swept job for a finished or in-flight install is a no-op.
 */
export async function installTemplate(data: InstallTemplateData, job: Job) {
  const { installationId, workspaceId } = data

  const claim = await templateInstallService.claim({
    installationId,
    workspaceId,
  })
  if (!claim) {
    return
  }
  const { claimToken } = claim

  await runLeasedTemplateJob({
    job,
    failureMessage: "Template install failed",
    logContext: { installationId, workspaceId },
    unknownErrorCode: UNKNOWN_INSTALL_ERROR_CODE,
    run: async () => {
      const { installation, payload, templateName, createInstallFolder } =
        await templateService.findInstallationByIdOrFail({
          installationId,
          workspaceId,
        })
      // Re-validate the stored payload on every install — never trust a
      // stored jsonb blob across a format change, even though it was already
      // validated once at save time.
      const parsed = parseTemplateExport(payload)
      if (!parsed.ok) {
        throw new ChatbotXException(
          `Template payload failed validation at install time: ${parsed.reason}`,
          "templatePayloadIncompatible",
        )
      }

      await templateInstallService.run({
        installationId,
        workspaceId,
        claimToken,
        permissions: installation.permissions,
        inboxBindings: installation.inboxBindings ?? undefined,
        payload: parsed.data,
        templateName,
        createInstallFolder,
        sourceVersion: installation.sourceVersion,
        stagingGeneration: installation.stagingGeneration,
      })
      await enqueueInstalledAiFiles(installationId)
    },
    release: () =>
      templateInstallService.release({ installationId, claimToken }),
    fail: (errorCode, error) =>
      templateInstallService.fail({
        installationId,
        workspaceId,
        claimToken,
        errorCode,
        error,
      }),
  })
}

/** Closes the row when the target owner is blocked, so the sweep never re-finds it. */
export async function failBlockedTemplateInstall(
  data: InstallTemplateData,
): Promise<void> {
  await templateService.markInstallationFailed({
    installationId: data.installationId,
    errorCode: "workspaceOwnerBlocked",
    errorMessage: "The workspace owner is blocked",
  })
}
