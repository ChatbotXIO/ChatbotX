import { db } from "@chatbotx.io/database/client"
import { ChatbotXException } from "../errors"

export const templateAllowDeleteViolationException = () =>
  new ChatbotXException(
    "This resource was installed from a template that disallows deletion",
    "templateAllowDeleteViolation",
  )

/**
 * Enforces `TemplateInstallation.permissions.allowDelete` for a category's
 * delete path. Filters `wasExisting = false` — a find-or-create manifest
 * match points at a row the installer already owned before the install
 * (`wasExisting: true`), and locking that row against deletion would be
 * hostile (it existed independently of this install). A `resourceId` that
 * simply doesn't appear in `TemplateInstalledResource` is treated as
 * already-gone, not blocked.
 *
 * Called from every affected category's own delete path — this function
 * only decides yes/no, it never performs the delete itself.
 */
export const assertDeletable = async (input: {
  workspaceId: string
  resourceKind: string
  resourceIds: readonly string[]
}): Promise<void> => {
  if (input.resourceIds.length === 0) {
    return
  }

  const rows = await db.query.templateInstalledResourceModel.findMany({
    where: {
      workspaceId: input.workspaceId,
      resourceKind: input.resourceKind,
      resourceId: { in: [...input.resourceIds] },
      wasExisting: false,
    },
    columns: { resourceId: true, installationId: true },
  })
  if (rows.length === 0) {
    return
  }

  const installationIds = [...new Set(rows.map((row) => row.installationId))]
  const installations = await db.query.templateInstallationModel.findMany({
    where: { id: { in: installationIds } },
    columns: { id: true, permissions: true },
  })
  const blockingInstallation = installations.find(
    (installation) => !installation.permissions.allowDelete,
  )
  if (blockingInstallation) {
    throw templateAllowDeleteViolationException()
  }
}
