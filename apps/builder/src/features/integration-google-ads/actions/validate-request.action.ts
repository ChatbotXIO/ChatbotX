"use server"

import { integrationGoogleAdsService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageGoogleAds } from "../lib/assert-can-manage-google-ads"
import { validateGoogleAdsRequest } from "../schema/actions"

const REDACTED = "[redacted]"

/**
 * A `validateOnly` configuration check against Google. The click id is
 * submitted to Google but never returned: the result carries a stable failure
 * code plus an optional sanitized detail, with any occurrence of the id redacted as a last guard.
 */
export const validateGoogleAdsRequestAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(validateGoogleAdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { conversionActionId, clickIdType, clickId },
      ctx,
    }) => {
      await assertCanManageGoogleAds({
        workspaceId,
        isSupportSession: ctx.isSupportSession,
      })
      const result = await integrationGoogleAdsService.validateIngest({
        workspaceId,
        conversionActionId,
        clickIdType,
        clickId,
      })
      if (result.ok) {
        return {
          ok: true as const,
          consentSummary: result.consentSummary,
          variableSkipped: result.variableSkipped,
          withheldAdPersonalization: result.withheldAdPersonalization,
        }
      }
      return {
        ok: false as const,
        code: result.code,
        detail: result.detail?.replaceAll(clickId, REDACTED),
      }
    },
  )
