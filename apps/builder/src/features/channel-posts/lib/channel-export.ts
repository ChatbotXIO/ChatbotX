import type { ExportFailureReason } from "@chatbotx.io/database/partials"
import { capabilityOfChannel } from "./post-capability"

/** The translated message of each reason a read-from-channel export fails. */
export const CHANNEL_EXPORT_FAILURE_MESSAGE_KEYS = {
  channelDisconnected: "posts.channelExport.failure.channelDisconnected",
  failed: "posts.channelExport.failure.failed",
  notSupported: "posts.channelExport.failure.notSupported",
  postNotFound: "posts.channelExport.failure.postNotFound",
  rateLimited: "posts.channelExport.failure.rateLimited",
} as const satisfies Record<ExportFailureReason, string>

/** The translated message of each refusal of the start that has its own wording. */
const START_ERROR_MESSAGE_KEYS = {
  FORBIDDEN: "posts.channelExport.forbidden",
  commentExportUnsupported: "posts.channelExport.failure.notSupported",
  exportInProgress: "posts.channelExport.inProgress",
  macLimitReached: "posts.export.blocked",
  postMessageQuotaExceeded: "posts.export.quotaExceeded",
  trialExpired: "posts.export.blocked",
  workspaceBlocked: "posts.export.blocked",
} as const

type StartErrorCode = keyof typeof START_ERROR_MESSAGE_KEYS

const isStartErrorCode = (code: unknown): code is StartErrorCode =>
  typeof code === "string" && code in START_ERROR_MESSAGE_KEYS

/** The message key for a refused start, by the error's code; anything else is a generic failure. */
export const channelExportStartErrorKey = (error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined
  return isStartErrorCode(code)
    ? START_ERROR_MESSAGE_KEYS[code]
    : ("posts.channelExport.startFailed" as const)
}

/**
 * Whether the post's channel can be read for its comments: the same capability
 * the server checks when the export starts.
 */
export const canReadCommentsFromChannel = (channel: string): boolean =>
  capabilityOfChannel(channel)?.commentExport === true
