"use server"

import { socialProviders } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { startSocialAccountOAuth } from "@/features/social-accounts/lib/start-social-account-oauth"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Starts the publishing connect (TikTok only: the other networks publish with
 * their inbox). Session-only: it is a browser
 * redirect to the platform's login dialog, so it has no public procedure (the
 * OAuth step is on the exempt list of invariant 23).
 */
export const connectSocialAccountAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), socialProviders.extract(["tiktok"])])
  .action(
    ({
      bindArgsParsedInputs: [, provider],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [string, "tiktok"]
      ctx: { workspace: WorkspaceModel }
    }) => startSocialAccountOAuth({ provider, workspace: ctx.workspace }),
  )
