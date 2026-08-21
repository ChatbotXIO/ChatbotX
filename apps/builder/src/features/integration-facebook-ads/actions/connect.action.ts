"use server"

import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildFacebookAdsAuthRedirect } from "./connect-redirect"

export const connectFacebookAds = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      ctx,
    }: {
      bindArgsParsedInputs: [string]
      ctx: {
        user: UserModel
        workspace: WorkspaceModel
      }
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      return buildFacebookAdsAuthRedirect({
        workspace: ctx.workspace,
        refererPath: `/space/${ctx.workspace.id}/settings/integrations`,
      })
    },
  )
