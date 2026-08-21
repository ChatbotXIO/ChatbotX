"use server"

import { ensureBrandingMenuEntry } from "@chatbotx.io/business/branding"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { isCommunity } from "@/env"
import { getTenantSettings } from "@/features/tenant/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { workspaceActionClient } from "@/lib/safe-action"
import { BRANDING_TITLE, getBrandingUrl } from "../lib"
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
    const { authorizedDomains, welcomeFlowId, ...rest } = parsedInput

    // The edit page gates entry with requireWorkspacePermission(workspaceId,
    // "superAdmin"), but workspaceActionClient only verifies membership — a
    // member could otherwise call this action directly, bypassing the page,
    // and set fields like customCss that render inside the public widget.
    // Permissions come from the middleware ctx (already loaded), so this gate
    // adds no extra round-trip.
    if (!hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")) {
      throw new Error("You need to be a super admin to update this webchat")
    }

    const integration = await findOrFail({
      table: integrationWebchatModel,
      where: {
        id,
        workspaceId,
      },
      message: "Webchat integration not found",
    })

    // Community keeps the "Built with" branding entry; silently re-add it
    // (same precedent as moveBrandingMenuLast in the messenger action).
    const persistentMenus =
      isCommunity() && rest.persistentMenus
        ? ensureBrandingMenuEntry(rest.persistentMenus, {
            label: BRANDING_TITLE,
            url: getBrandingUrl("webchat", (await getTenantSettings()).appUrl),
          })
        : rest.persistentMenus

    await db.transaction(async (tx) => {
      await tx
        .update(integrationWebchatModel)
        .set({
          ...rest,
          persistentMenus,
          workspaceId,
          welcomeFlowId: welcomeFlowId?.length ? welcomeFlowId : null,
          authorizedDomains: authorizedDomains
            ? authorizedDomains.map((domain) => domain.value)
            : undefined,
        })
        .where(eq(integrationWebchatModel.id, integration.id))
    })
  })
