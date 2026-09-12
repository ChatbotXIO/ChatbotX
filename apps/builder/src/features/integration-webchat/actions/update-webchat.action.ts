"use server"

import { integrationWebchatService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTenantSettings } from "@/features/tenant/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClient } from "@/lib/safe-action"
import { applyWebchatBranding } from "../lib"
import { updateWebchatRequest } from "../schema/mutation"

export const updateWebchatAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWebchatRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
      ctx,
    } = props
    const { authorizedDomains, ...rest } = parsedInput

    // The edit page gates entry with requireWorkspacePermission(workspaceId,
    // "superAdmin"), but workspaceActionClient only verifies membership — a
    // member could otherwise call this action directly, bypassing the page,
    // and set fields like customCss that render inside the public widget.
    // Permissions come from the middleware ctx (already loaded), so this gate
    // adds no extra round-trip.
    if (!hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")) {
      throw new Error("You need to be a super admin to update this webchat")
    }

    const integration = await integrationWebchatService.findByIdForWorkspace({
      id,
      workspaceId,
    })

    const persistentMenus = rest.persistentMenus
      ? applyWebchatBranding(
          rest.persistentMenus,
          (await getTenantSettings()).appUrl,
        )
      : rest.persistentMenus

    await integrationWebchatService.update({
      workspaceId,
      id: integration.id,
      data: {
        ...rest,
        persistentMenus,
        // Normalization (falsy -> null) and workspace-ownership validation
        // now live in `integrationWebchatService.update` so this action and
        // the public API handler cannot drift on this field.
        authorizedDomains: authorizedDomains
          ? authorizedDomains.map((domain) => domain.value)
          : undefined,
      },
    })
  })
