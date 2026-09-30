import { buildContext, contactInboxService } from "@chatbotx.io/business"
import { integrationInstagramRepository } from "@chatbotx.io/database/repositories"
import {
  type InstagramAuthValue,
  integration as instagramIntegration,
} from "@chatbotx.io/integration-instagram"
import {
  type InstagramAuthValue as InstagramFacebookAuthValue,
  integration as instagramFacebookIntegration,
} from "@chatbotx.io/integration-instagram-facebook"
import { toLogSafeError } from "@chatbotx.io/logger"
import { SdkException } from "@chatbotx.io/sdk"
import type { InstagramSnapshotJobData } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { isRetryable } from "./shared/http-retry"

const unavailableSnapshotCodes = new Set([230])
const retryableSnapshotCodes = new Set([4, 17, 613])

const numberCode = (code: string | number): number | undefined => {
  if (typeof code === "number") {
    return code
  }
  const parsed = Number(code)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

const snapshotOutcomeForError = (
  error: unknown,
): "failed" | "retry" | "unavailable" => {
  if (isRetryable(error)) {
    return "retry"
  }
  if (!(error instanceof SdkException)) {
    return "retry"
  }
  const code = numberCode(error.code)
  const subCode = error.subCode == null ? undefined : numberCode(error.subCode)
  if (
    code !== undefined &&
    (unavailableSnapshotCodes.has(code) || (code === 100 && subCode === 33))
  ) {
    return "unavailable"
  }
  if (
    error.httpStatusCode === 429 ||
    error.httpStatusCode >= 500 ||
    (code !== undefined && retryableSnapshotCodes.has(code))
  ) {
    return "retry"
  }
  return "failed"
}

const emptySnapshot = {
  follow: null,
  followers: null,
  following: null,
  verified: null,
}

type InstagramSnapshot = {
  follow: boolean | null
  followers: number | null
  following: boolean | null
  verified: boolean | null
}

export const captureInstagramSnapshot = async (
  data: InstagramSnapshotJobData["data"],
): Promise<void> => {
  const claim = await contactInboxService.claimInstagramSnapshot(data)
  if (!claim) {
    return
  }

  const integration =
    await integrationInstagramRepository.findByInboxIdForWorkspace({
      inboxId: data.inboxId,
      workspaceId: data.workspaceId,
    })
  if (!integration) {
    await contactInboxService.completeInstagramSnapshot({
      ...data,
      attempt: claim.attempt,
      outcome: "unavailable",
      snapshot: emptySnapshot,
    })
    return
  }

  let snapshot: InstagramSnapshot
  try {
    snapshot =
      integration.type === "facebook"
        ? await instagramFacebookIntegration.runChannelHandler(
            "contact",
            "getInstagramSnapshot",
            {
              ctx: await buildContext({
                integration: {
                  ...integration,
                  auth: integration.auth as InstagramFacebookAuthValue,
                },
                integrationType: "instagramFacebook",
                workspaceId: data.workspaceId,
              }),
              data: { sourceId: claim.sourceId },
            },
          )
        : await instagramIntegration.runChannelHandler(
            "contact",
            "getInstagramSnapshot",
            {
              ctx: await buildContext({
                integration: {
                  ...integration,
                  auth: integration.auth as InstagramAuthValue,
                },
                integrationType: "instagram",
                workspaceId: data.workspaceId,
              }),
              data: { sourceId: claim.sourceId },
            },
          )
  } catch (err) {
    // Never log the raw integration error: its nested request URL carries the
    // Graph `access_token`. toLogSafeError keeps a scrubbed name/message/stack.
    const safeError = toLogSafeError(err)
    const outcome = snapshotOutcomeForError(err)
    if (outcome === "retry") {
      const state = await contactInboxService.rescheduleInstagramSnapshot({
        ...data,
        attempt: claim.attempt,
      })
      if (state === "failed") {
        logger.error(
          { err: safeError, ...data, attempt: claim.attempt },
          "Instagram snapshot retry budget exhausted",
        )
      }
      return
    }

    const completed = await contactInboxService.completeInstagramSnapshot({
      ...data,
      attempt: claim.attempt,
      outcome,
      snapshot: emptySnapshot,
    })
    if (completed) {
      if (outcome === "failed") {
        logger.error(
          { err: safeError, ...data, attempt: claim.attempt, outcome },
          "Instagram snapshot completed without profile fields",
        )
      } else {
        logger.warn(
          { err: safeError, ...data, attempt: claim.attempt, outcome },
          "Instagram snapshot completed without profile fields",
        )
      }
    }
    return
  }

  await contactInboxService.completeInstagramSnapshot({
    ...data,
    attempt: claim.attempt,
    outcome: "captured",
    snapshot,
  })
}
