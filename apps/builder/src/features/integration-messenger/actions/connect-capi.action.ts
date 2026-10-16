"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { startMetaCapiOAuth } from "@/features/meta-conversions/lib/start-meta-capi-oauth"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Starts the dedicated Conversions API connect for a Messenger page: a Facebook
 * dialog that mints a separate token, stored by the OAuth callback next to the
 * page's own login token (see `startMetaCapiOAuth`).
 */
export const connectMessengerCapiAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    ({
      bindArgsParsedInputs: [, integrationId],
      ctx,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      ctx: { workspace: WorkspaceModel }
    }) =>
      startMetaCapiOAuth({
        channel: "messenger",
        workspace: ctx.workspace,
        integrationId,
      }),
  )
