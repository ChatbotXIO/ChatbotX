"use server"

import { workspaceService } from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import { getManageAccess } from "@/app/manage/reseller-guard"
import { authActionClient } from "@/lib/safe-action"
import { transferWorkspaceToOwnerSchema } from "../schema/transfer"

/**
 * Moves a sub-account's workspace to the signed-in reseller's platform
 * workspaces. The reseller is always `ctx.user`; the tenant is derived from
 * them inside the service, never from input.
 */
export const transferWorkspaceToOwnerAction = authActionClient
  .inputSchema(transferWorkspaceToOwnerSchema)
  .action(async ({ ctx, parsedInput }) => {
    const { canManageReseller } = await getManageAccess()
    if (!canManageReseller) {
      throw new Error("Unauthorized")
    }

    const result = await workspaceService.transferSubAccountWorkspaceToOwner({
      resellerUserId: ctx.user.id,
      workspaceId: parsedInput.workspaceId,
      actorUserId: ctx.user.id,
    })
    revalidatePath("/manage/sub-account-workspaces")
    return result
  })
