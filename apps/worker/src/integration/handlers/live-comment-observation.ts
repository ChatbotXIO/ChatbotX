import { channelPostService } from "@chatbotx.io/business"
import type {
  ChannelPostLiveState,
  ChannelPostLiveStatus,
} from "@chatbotx.io/utils/channel-post"
import { logger } from "../../lib/logger"

type LiveCommentObservationInput = {
  channel: string
  externalPostId: string
  inboxId: string
  integrationId: string
  /** The stored broadcast status of the post; a live comment adds nothing once it has one. */
  currentLiveStatus?: ChannelPostLiveStatus | null
  /** What the comment's own lookup said about the broadcast; `unknown` or absent records nothing. */
  liveState: ChannelPostLiveState | null | undefined
  sourceAccountId: string
  workspaceId: string
}

/**
 * A live comment is weak evidence about its broadcast (the comment lookup, or
 * Instagram's `live_comments` field): it marks the post as a live broadcast
 * and can end it, but never reopens an ended one (the repository's guard). Best
 * effort: the comment is already stored, and a failure here is repaired by the
 * next sync or re-read, so it must not fail the comment's ingestion.
 */
export async function recordLiveCommentObservation(
  input: LiveCommentObservationInput,
): Promise<void> {
  const { currentLiveStatus, liveState, ...target } = input
  if (liveState !== "live" && liveState !== "ended") {
    return
  }
  // The repository's guard lets a comment start a live status only on a row
  // with none, and an "ended" comment on an ended row changes nothing: both
  // writes would only lock the hot row.
  if (
    (liveState === "live" && currentLiveStatus) ||
    currentLiveStatus === liveState
  ) {
    return
  }
  try {
    await channelPostService.recordLiveObservation({
      ...target,
      observedAt: new Date(),
      source: "comment",
      status: liveState,
    })
  } catch (err) {
    logger.warn(
      { err, externalPostId: input.externalPostId },
      "live-comment: could not record the broadcast state",
    )
  }
}

/**
 * The broadcast state a live comment evidences. Facebook: what the comment
 * lookup read (`null` when it was not a live comment, `unknown` when the read
 * could not say). Instagram through Facebook Login: its `live_comments` field
 * only says a broadcast is on the air. Instagram Login and the other channels
 * record nothing (no end signal exists there, so a live row could never end).
 */
export function commentLiveState(input: {
  integrationType: string
  isInstagramViaFacebook: boolean
  isLiveComment: boolean
  lookupLiveState: ChannelPostLiveState | null | undefined
}): ChannelPostLiveState | null {
  if (input.integrationType === "messenger") {
    return input.lookupLiveState ?? null
  }
  return input.isInstagramViaFacebook && input.isLiveComment ? "live" : null
}
