"use server"

import { googleAdsConversionService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageGoogleAds,
  googleAdsException,
} from "../lib/assert-can-manage-google-ads"
import { retryGoogleAdsEventRequest } from "../schema/actions"

export const retryGoogleAdsEventAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(retryGoogleAdsEventRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { eventId },
      ctx,
    }) => {
      await assertCanManageGoogleAds({
        workspaceId,
        isSupportSession: ctx.isSupportSession,
      })
      const result = await googleAdsConversionService.retry({
        id: eventId,
        workspaceId,
      })
      if (result.status === "notRetryable") {
        throw await googleAdsException("notRetryable", 409)
      }
    },
  )
