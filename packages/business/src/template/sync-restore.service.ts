import {
  isActiveInstallation,
  type TemplateResourceCategory,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateResourceBackupRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { ChatbotXException, notFoundException } from "../errors"
import { getTemplateAdapter } from "./adapters/registry"
import { isUpdatable } from "./adapters/shared"
import { invalidateAfterCommit } from "./install.service"
import { assertResourceEditable } from "./installed-resource.service"
import { TEMPLATE_LOCKED_CONTENT_KEYS } from "./lock-policy"
import {
  assertCanUseTemplateCategories,
  assertCanWriteTemplateInstalls,
  type TemplateActor,
} from "./permissions"
import {
  templateBackupNotRestorableException,
  templateUninstallInProgressException,
} from "./template-errors"
import { withTemplateLockedTransaction } from "./template-resource-locks"

const TEMPLATE_SYNC_STATEMENT_TIMEOUT = "60s"

/**
 * Restoring a backup is a request/transaction service (the member clicked it
 * and waits for the answer), not worker execution: it lives apart from
 * `@chatbotx.io/business/template-sync/execute`, which only the worker may
 * import (AGENTS.md invariant 25), and is reached through
 * `@chatbotx.io/business/template-sync/restore`.
 */
export const templateSyncRestoreService = {
  /**
   * Puts back what a sync overwrote on one copy. The server resolves and
   * checks every link (backup, installation, copy, workspace) and takes the
   * same install lock as a sync, so it can not interleave with one. The
   * restored copy then counts as locally modified for the next sync.
   */
  async restoreBackup(input: {
    workspaceId: string
    installationId: string
    backupId: string
    actor: TemplateActor
  }): Promise<void> {
    assertCanWriteTemplateInstalls(input.actor)
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (
      !(
        installation?.sourceTemplateId &&
        isActiveInstallation(installation.status)
      )
    ) {
      throw notFoundException("Template installation not found")
    }
    const backup =
      await templateResourceBackupRepository.findByIdAndInstallation({
        id: input.backupId,
        installationId: installation.id,
        workspaceId: input.workspaceId,
      })
    if (!backup) {
      throw notFoundException("Backup not found")
    }
    const sourceTemplateId = installation.sourceTemplateId
    await withTemplateLockedTransaction(
      async (tx) => {
        if (
          await templateInstallationSyncRepository.findActiveByInstallation(
            installation.id,
            tx,
          )
        ) {
          throw new ChatbotXException(
            "A sync of this installation is in progress",
            "templateSyncInProgress",
            409,
          )
        }
        if (
          await templateUninstallStateRepository.isInProgress(
            installation.id,
            tx,
          )
        ) {
          throw templateUninstallInProgressException()
        }
        const row = (
          await templateInstallationSyncRepository.listInstalledResources(
            installation.id,
            tx,
          )
        ).find((candidate) => candidate.id === backup.installedResourceId)
        if (!row || row.detachedAt || row.wasExisting) {
          throw notFoundException("Backup target not found")
        }
        assertCanUseTemplateCategories(input.actor, { [row.category]: 1 })
        // Another installation that still locks this copy wins (P2 precedence);
        // this also takes the copy's `tpl-res:` lock, before anything is read.
        await assertResourceEditable({
          workspaceId: input.workspaceId,
          resourceKind: row.resourceKind,
          resourceIds: [row.resourceId],
          changedKeys: TEMPLATE_LOCKED_CONTENT_KEYS[row.resourceKind],
          excludeInstallationIds: [installation.id],
          tx,
        })
        const handler = getTemplateAdapter(
          row.category as TemplateResourceCategory,
        )?.sync
        if (
          !(handler && isUpdatable(handler)) ||
          row.resourceKind !== backup.resourceKind
        ) {
          throw templateBackupNotRestorableException()
        }
        if ((await handler.project(tx, row.resourceId)) === null) {
          throw notFoundException("Backup target not found")
        }
        await handler.restoreBackup(
          tx,
          row.resourceId,
          backup.content,
          backup.formatVersion,
        )
      },
      {
        prepare: async (tx) => {
          await setLocalStatementTimeout(tx, TEMPLATE_SYNC_STATEMENT_TIMEOUT)
          await templateInstallationRepository.lockInstallRequest(
            { workspaceId: input.workspaceId, sourceTemplateId },
            tx,
          )
        },
      },
    )
    await invalidateAfterCommit(input.workspaceId)
  },
}
