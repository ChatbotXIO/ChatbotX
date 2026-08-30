"use server"

import { templateService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClient } from "@/lib/safe-action"
import { installTemplateRequest } from "../schema/mutation"

/**
 * Binds the *user-chosen* target workspace as a bound arg (not part of the
 * free-form input), the same way every other workspace-scoped action does —
 * `workspaceActionClient` re-validates the caller's membership in that
 * workspace server-side, so a forged workspace id in the request fails at
 * the client layer before this action body even runs.
 * `templateService.assertInstallable` then enforces the same-tenant gate on
 * top of that membership check.
 *
 * Follows the `import-products.action.ts` shape: create the tracking row
 * first, enqueue inside a try, and mark the row failed on enqueue failure
 * so it is never left stuck at `pending`.
 */
export const installTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(installTemplateRequest)
  .action(
    async ({
      ctx: { user, workspaceMemberPermissions },
      bindArgsParsedInputs: [targetWorkspaceId],
      parsedInput,
    }) => {
      // The public landing page's workspace picker already filters to
      // superAdmin workspaces, but that is a UI convenience — a member
      // could still call this action directly with a workspace id from
      // elsewhere, so the real gate lives here.
      if (!hasWorkspacePermission(workspaceMemberPermissions, "superAdmin")) {
        throw new ChatbotXException(
          "You need to be a super admin to install a template into this workspace",
          "templateInstallSuperAdminRequired",
          403,
        )
      }

      const { template } = await templateService.assertInstallable({
        shareToken: parsedInput.shareToken,
        targetWorkspaceId,
      })

      const installation = await templateService.createInstallationRecord({
        workspaceId: targetWorkspaceId,
        installedBy: user.id,
        template,
      })

      try {
        await defaultQueue.add(
          DefaultJobAction.installTemplate,
          {
            type: DefaultJobAction.installTemplate,
            data: {
              installationId: installation.id,
              workspaceId: targetWorkspaceId,
            },
          },
          { jobId: `install-template-${installation.id}` },
        )
      } catch (error) {
        await templateService.markInstallationFailed({
          installationId: installation.id,
          errorMessage: "Unable to queue template install",
        })
        throw error
      }

      return { installationId: installation.id }
    },
  )
