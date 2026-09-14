"use server"

import { templateService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
 * The install/enqueue/failure-compensation sequence itself lives in
 * `templateService.enqueueInstallation`, shared with the public
 * `POST /v1/templates/installations` route.
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

      const installation = await templateService.enqueueInstallation({
        shareToken: parsedInput.shareToken,
        workspaceId: targetWorkspaceId,
        installedBy: user.id,
      })

      return { installationId: installation.id }
    },
  )
