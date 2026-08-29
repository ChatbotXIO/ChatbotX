import { templateInstallService, templateService } from "@chatbotx.io/business"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

/**
 * Not under `handlers/imports/` — a share-link install has its own
 * `TemplateInstallation` status surface, never touching the `Import` table
 * (`Import.fileId` is `notNull()` with `onDelete: "restrict"`, and a
 * share-link install has no file).
 */
export async function installTemplate(data: {
  installationId: string
  workspaceId: string
}) {
  const { installationId, workspaceId } = data

  try {
    const { payload, templateName, createInstallFolder } =
      await templateService.findInstallationByIdOrFail({
        installationId,
        workspaceId,
      })
    // Re-validate the stored payload on every install — never trust a
    // stored jsonb blob across a format change, even though it was already
    // validated once at save time.
    const parsed = parseTemplateExport(payload)
    if (!parsed.ok) {
      throw new Error(
        `Template payload failed validation at install time: ${parsed.reason}`,
      )
    }

    await templateInstallService.run({
      installationId,
      workspaceId,
      payload: parsed.data,
      templateName,
      createInstallFolder,
    })
  } catch (error) {
    logger.error(
      { err: normalizeError(error), installationId, workspaceId },
      "Template install failed",
    )
    throw error
  }
}
