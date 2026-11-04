/** Why a file a customer attached to a form answer could not be kept. */
export const flowResponseFileFailureReasons = [
  "too_large",
  "download_failed",
  "unsupported_type",
] as const
export type FlowResponseFileFailureReason =
  (typeof flowResponseFileFailureReasons)[number]

/**
 * A file of a form (Flow) answer that was kept. `mediaId` is the provider's
 * media id, also the `sourceId` of the Attachment row holding the stored copy:
 * the message keeps no URL, readers resolve it through that attachment.
 */
export type StoredFlowResponseFile = {
  status: "stored"
  mediaId: string
  fileName: string
  mimeType: string
  size: number
}

/** A file of a form answer that could not be kept, and why. */
export type FailedFlowResponseFile = {
  status: "failed"
  mediaId: string
  fileName: string
  mimeType: string | null
  reason: FlowResponseFileFailureReason
}

/** One file of a form answer, as the channel's ingestion left it. */
export type FlowResponseFile = StoredFlowResponseFile | FailedFlowResponseFile
