"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { startMetaCapiOAuth } from "@/features/meta-conversions/lib/start-meta-capi-oauth"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Starts the dedicated Conversions API connect for an Instagram account
 * connected with Facebook login: a Facebook dialog that mints a separate token,
 * stored by the OAuth callback next to the account's own login token (see
 * `startMetaCapiOAuth`).
 */
export const connectInstagramCapiAction = workspaceActionClient
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
        channel: "instagram",
        workspace: ctx.workspace,
        integrationId,
      }),
  )
