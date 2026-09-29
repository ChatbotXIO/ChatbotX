"use server"

import { tiktokIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  getTiktokDirectReplyStatus,
  type TiktokAuthValue,
  type TiktokDirectReplyStatus,
  updateTiktokDirectReplyStatus,
} from "@chatbotx.io/integration-tiktok"
import { z } from "zod"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Caches the status on the integration's auth metadata.
 *
 * A cache, never the authority — the owner can flip Comment-to-Message inside
 * the TikTok app and nothing notifies us, which is why the settings row also
 * offers a re-check. The spread keeps `scopes` and the profile fields, which
 * token refresh re-stamps onto this same object.
 */
const cacheCommentToMessageStatus = async (props: {
  id: string
  auth: TiktokAuthValue
  status: TiktokDirectReplyStatus
}) => {
  const updatedAuth: TiktokAuthValue = {
    ...props.auth,
    metadata: {
      ...props.auth.metadata,
      commentToMessage: {
        status: props.status,
        checkedAt: new Date().toISOString(),
      },
    },
  }
  await tiktokIntegrationService.updateAuth(props.id, updatedAuth)
}

/**
 * Turns TikTok's Comment-to-Message on or off for one connected account.
 *
 * TikTok's own rejection text is the only thing that says WHICH eligibility rule
 * an account failed — registered in Vietnam, Indonesia or Thailand; owner over
 * 18; a Registered Business Account or one that has run Messaging Ads; messaging
 * permissions set to "Requests". So it is surfaced verbatim rather than replaced
 * with a generic failure.
 */
export const toggleTiktokCommentToMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(z.object({ enabled: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput: { enabled },
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: { enabled: boolean }
    }) => {
      const integrationTiktok = await tiktokIntegrationService.findById({
        id,
        workspaceId,
      })
      const auth = integrationTiktok.auth as TiktokAuthValue
      const status: TiktokDirectReplyStatus = enabled ? "ENABLE" : "DISABLE"

      try {
        await updateTiktokDirectReplyStatus(
          auth.tokens.accessToken,
          auth.metadata.openId,
          status,
        )
      } catch (error) {
        logger.error(
          { err: error, id, workspaceId },
          "Failed to update TikTok Comment-to-Message",
        )
        throw new ChatbotXException(
          error instanceof Error
            ? error.message
            : "Failed to update TikTok Comment-to-Message",
        )
      }

      await cacheCommentToMessageStatus({ id, auth, status })

      await auditService.record({
        workspaceId,
        action: "update",
        detail: `${enabled ? "enabled" : "disabled"} TikTok Comment-to-Message`,
      })

      return { status }
    },
  )

/**
 * Re-reads the setting from TikTok and re-caches it.
 *
 * Exists because the toggle can be flipped in the TikTok app, and because every
 * connection made before this shipped carries no cached value at all — without
 * a way to ask, those rows would read "off" forever.
 */
export const refreshTiktokCommentToMessageAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      const integrationTiktok = await tiktokIntegrationService.findById({
        id,
        workspaceId,
      })
      const auth = integrationTiktok.auth as TiktokAuthValue

      let status: TiktokDirectReplyStatus | undefined
      try {
        status = await getTiktokDirectReplyStatus(
          auth.tokens.accessToken,
          auth.metadata.openId,
        )
      } catch (error) {
        logger.error(
          { err: error, id, workspaceId },
          "Failed to read the TikTok Comment-to-Message setting",
        )
        throw new ChatbotXException(
          error instanceof Error
            ? error.message
            : "Failed to read the TikTok Comment-to-Message setting",
        )
      }

      if (!status) {
        // TikTok answered without a status. Leaving the cache alone beats
        // recording a guess the toggle would then present as fact.
        return { status: null }
      }

      await cacheCommentToMessageStatus({ id, auth, status })
      return { status }
    },
  )
