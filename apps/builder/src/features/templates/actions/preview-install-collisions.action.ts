"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { previewInstallCollisionsForShare } from "../queries/preview-install-collisions"

/**
 * Read-only: what installing the shared template would reuse, create or rename
 * in the chosen workspace. Membership comes from `workspaceActionClient`; the
 * install gates (same tenant, category permissions) run inside the query.
 */
export const previewInstallCollisionsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(
    z.object({
      shareToken: z.string().trim().min(1),
      inboxBindings: z
        .record(zodBigintAsString(), zodBigintAsString())
        .optional(),
    }),
  )
  .action(
    async ({
      ctx: { workspaceMemberPermissions },
      bindArgsParsedInputs: [targetWorkspaceId],
      parsedInput,
    }) =>
      await previewInstallCollisionsForShare({
        shareToken: parsedInput.shareToken,
        inboxBindings: parsedInput.inboxBindings,
        targetWorkspaceId,
        actor: { kind: "member", permissions: workspaceMemberPermissions },
      }),
  )
