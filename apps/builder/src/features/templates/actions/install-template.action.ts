"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { requestTemplateInstall } from "../lib/request-install"
import { installTemplateRequest } from "../schema/mutation"

/**
 * Binds the *user-chosen* target workspace as a bound arg (not part of the
 * free-form input), the same way every other workspace-scoped action does —
 * `workspaceActionClient` re-validates the caller's membership in that
 * workspace server-side, so a forged workspace id in the request fails at
 * the client layer before this action body even runs.
 * `templateInstallationRequestService.request` then enforces the same-tenant
 * gate and the caller's permission for every category the template contains,
 * in the target workspace. An installed copy is updated in place unless
 * `allowDuplicate` asks for a separate one.
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
      const { installationId, syncId } = await requestTemplateInstall({
        shareToken: parsedInput.shareToken,
        targetWorkspaceId,
        installedBy: user.id,
        actor: { kind: "member", permissions: workspaceMemberPermissions },
        allowDuplicate: parsedInput.allowDuplicate,
        autoUpdate: parsedInput.autoUpdate,
        acceptPublisherUninstall: parsedInput.acceptPublisherUninstall,
        inboxBindings: parsedInput.inboxBindings,
        idempotencyKey: parsedInput.idempotencyKey,
      })
      return { installationId, syncId: syncId ?? null }
    },
  )
