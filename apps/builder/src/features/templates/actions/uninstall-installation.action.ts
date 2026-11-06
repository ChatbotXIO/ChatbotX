"use server"

import {
  templateUninstallCancelService,
  templateUninstallService,
} from "@chatbotx.io/business/template-uninstall"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { installerActionClientAllowExpired } from "./installer-action-client"

/**
 * The installer's own uninstall, like retry and sync, needs only the right to
 * see installs; the service checks the permission of everything the install
 * holds. Available after a trial expires (read/delete-only workspaces).
 */
export const previewUninstallInstallationAction =
  installerActionClientAllowExpired
    .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
    .action(
      async ({
        ctx: { templateActor },
        bindArgsParsedInputs: [workspaceId, installationId],
      }) =>
        await templateUninstallService.previewAsInstaller({
          workspaceId,
          installationId,
          actor: templateActor,
        }),
    )

export const uninstallInstallationAction = installerActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      ctx: { user, templateActor },
      bindArgsParsedInputs: [workspaceId, installationId],
    }) =>
      await templateUninstallService.uninstallAsInstaller({
        workspaceId,
        installationId,
        actor: templateActor,
        // Named in the audit summary of the operation.
        requestedBy: user.id,
      }),
  )

/** Takes back an uninstall that stopped part-way: waiting copies are given back and unfrozen. */
export const cancelUninstallInstallationAction =
  installerActionClientAllowExpired
    .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
    .action(
      async ({
        ctx: { templateActor },
        bindArgsParsedInputs: [workspaceId, installationId],
      }) =>
        await templateUninstallCancelService.cancelAsInstaller({
          workspaceId,
          installationId,
          actor: templateActor,
        }),
    )
