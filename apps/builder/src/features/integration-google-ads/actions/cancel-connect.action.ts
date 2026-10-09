"use server"

import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { assertCanManageGoogleAds } from "../lib/assert-can-manage-google-ads"
import { requireGoogleAdsSession } from "../lib/connect-session"
import { cancelGoogleAdsConnectRequest } from "../schema/actions"

// Allowed after trial expiry (AGENTS.md invariant 14), like disconnect:
// abandoning a connect attempt must stay available when the workspace is
// read/delete-only.
export const cancelGoogleAdsConnectAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(cancelGoogleAdsConnectRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { sessionId },
      ctx,
    }) => {
      await assertCanManageGoogleAds({
        workspaceId,
        isSupportSession: ctx.isSupportSession,
      })
      await requireGoogleAdsSession({ sessionId, workspaceId })
      await connectSessionService.cancel({ id: sessionId, workspaceId })
    },
  )
