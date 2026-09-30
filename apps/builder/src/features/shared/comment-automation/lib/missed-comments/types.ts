import type { IntegrationJobReceiveComment } from "@chatbotx.io/worker-config"

/** How far back a run looks. Matches Meta's private-reply window. */
export const MISSED_COMMENTS_SCAN_DAYS = 7

/**
 * A run reads every page back to the scan window, like AhaChat's replay; the
 * window is what normally ends it. This cap is only a backstop against a list
 * edge that never stops returning a next cursor — at 100 per page it is far
 * above any real post's week of comments.
 */
export const MISSED_COMMENTS_MAX_PAGES = 200

export type IncomingCommentData =
  IntegrationJobReceiveComment["data"]["commentData"]

/**
 * One comment shaped exactly like its channel's webhook enqueues it, so the
 * replay runs through the same `receiveComment` path as a live comment.
 */
export type ScannedComment = {
  integrationIdentifier: string
  commentData: IncomingCommentData
}

export type ScanCommentsProps = {
  workspaceId: string
  postId: string
  since: Date
}

/** No connected account of the automation's channel could reach the post. */
export class MissedCommentsIntegrationNotFoundError extends Error {
  constructor() {
    super("No connected integration for this automation's channel")
    this.name = "MissedCommentsIntegrationNotFoundError"
  }
}
