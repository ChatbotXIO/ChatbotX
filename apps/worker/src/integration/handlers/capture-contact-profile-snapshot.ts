import { contactInboxService } from "@chatbotx.io/business"
import {
  type ProfileSnapshotChannel,
  supportsProfileSnapshot,
} from "@chatbotx.io/database/partials"
import { toLogSafeError } from "@chatbotx.io/logger"
import {
  ChannelError,
  type ContactProfileSnapshot,
  SdkException,
} from "@chatbotx.io/sdk"
import type { ProfileSnapshotJobData } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"
import { isRetryable } from "./shared/http-retry"

type SnapshotOutcome = "failed" | "retry" | "unavailable"

/**
 * How one channel's provider errors map to a snapshot outcome. Provider codes
 * live here, not inline, so adding a channel to `profileSnapshotChannels` means
 * adding one policy entry (the `Record` makes a missing one a compile error).
 */
type SnapshotErrorPolicy = {
  /** The contact's profile can never be read (terminal, no retry budget spent). */
  isUnavailable: (
    code: number | undefined,
    subCode: number | undefined,
  ) => boolean
  /** Provider codes that mean "try again later" besides HTTP 429/5xx. */
  retryableCodes: ReadonlySet<number>
}

/** Meta Graph: #230 consent missing, #100/33 object not readable; #4/#17/#613 rate limits. */
const metaGraphPolicy: SnapshotErrorPolicy = {
  isUnavailable: (code, subCode) =>
    code === 230 || (code === 100 && subCode === 33),
  retryableCodes: new Set([4, 17, 613]),
}

const snapshotErrorPolicyByChannel: Record<
  ProfileSnapshotChannel,
  SnapshotErrorPolicy
> = {
  instagram: metaGraphPolicy,
}

/** The registry could not find/authenticate an integration: nothing to fetch with. */
const MISSING_INTEGRATION_CODES: ReadonlySet<string> = new Set([
  "integration_auth_missing",
  "unsupported_channel",
])

const numberCode = (code: string | number): number | undefined => {
  if (typeof code === "number") {
    return code
  }
  const parsed = Number(code)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

const snapshotOutcomeForError = (
  channel: ProfileSnapshotChannel,
  error: unknown,
): SnapshotOutcome => {
  if (
    error instanceof ChannelError &&
    MISSING_INTEGRATION_CODES.has(String(error.code))
  ) {
    return "unavailable"
  }
  if (isRetryable(error) || !(error instanceof SdkException)) {
    return "retry"
  }
  const policy = snapshotErrorPolicyByChannel[channel]
  const code = numberCode(error.code)
  const subCode = error.subCode == null ? undefined : numberCode(error.subCode)
  if (policy.isUnavailable(code, subCode)) {
    return "unavailable"
  }
  if (
    error.httpStatusCode === 429 ||
    error.httpStatusCode >= 500 ||
    (code !== undefined && policy.retryableCodes.has(code))
  ) {
    return "retry"
  }
  return "failed"
}

const emptySnapshot: ContactProfileSnapshot = {
  followsBusiness: null,
  businessFollowsContact: null,
  accountVerified: null,
  followerCount: null,
}

export const captureContactProfileSnapshot = async (
  data: ProfileSnapshotJobData["data"],
): Promise<void> => {
  const claim = await contactInboxService.claimProfileSnapshot(data)
  if (!claim) {
    return
  }

  const { channel } = claim
  if (!supportsProfileSnapshot(channel)) {
    await contactInboxService.completeProfileSnapshot({
      ...data,
      attempt: claim.attempt,
      outcome: "unavailable",
      snapshot: emptySnapshot,
    })
    return
  }

  let snapshot: ContactProfileSnapshot
  try {
    const { integration, ctx } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: data.workspaceId,
        contactInbox: { channel, inboxId: data.inboxId },
      })
    snapshot = await integration.runChannelHandler(
      "contact",
      "getProfileSnapshot",
      { ctx, data: { sourceId: claim.sourceId } },
    )
  } catch (err) {
    // Never log the raw integration error: its nested request URL carries the
    // Graph `access_token`. toLogSafeError keeps a scrubbed name/message/stack.
    const safeError = toLogSafeError(err)
    const outcome = snapshotOutcomeForError(channel, err)
    if (outcome === "retry") {
      const state = await contactInboxService.rescheduleProfileSnapshot({
        ...data,
        attempt: claim.attempt,
      })
      if (state === "failed") {
        logger.error(
          { err: safeError, ...data, attempt: claim.attempt },
          "Profile snapshot retry budget exhausted",
        )
      }
      return
    }

    const completed = await contactInboxService.completeProfileSnapshot({
      ...data,
      attempt: claim.attempt,
      outcome,
      snapshot: emptySnapshot,
    })
    if (completed) {
      const context = {
        err: safeError,
        ...data,
        attempt: claim.attempt,
        outcome,
      }
      if (outcome === "failed") {
        logger.error(
          context,
          "Profile snapshot completed without profile fields",
        )
      } else {
        logger.warn(
          context,
          "Profile snapshot completed without profile fields",
        )
      }
    }
    return
  }

  await contactInboxService.completeProfileSnapshot({
    ...data,
    attempt: claim.attempt,
    outcome: "captured",
    snapshot,
  })
}
