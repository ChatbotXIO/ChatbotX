"use server"

import {
  adsRetargetService,
  startRetargetAudienceSyncShape,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

const retargetAdRequest = startRetargetAudienceSyncShape
  .omit({ workspaceId: true })
  .refine((input) => input.audienceName || input.customAudienceId, {
    message: "audienceName or customAudienceId is required",
    path: ["audienceName"],
  })

export const retargetAdAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(retargetAdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await assertWorkspaceSuperAdmin(workspaceId)

    return adsRetargetService.startAudienceSync({
      ...parsedInput,
      workspaceId,
    })
  })
