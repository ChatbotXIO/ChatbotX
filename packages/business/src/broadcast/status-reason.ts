import type { BroadcastStatusReason } from "@chatbotx.io/database/partials"
import { BROADCAST_STATUS_ERROR_MESSAGE_MAX_LENGTH } from "@chatbotx.io/database/partials"
import { ChannelErrorReason } from "@chatbotx.io/sdk"

/**
 * SDK error reason -> persisted broadcast status reason. Exhaustive on purpose:
 * a new `ChannelErrorReason` fails to compile until it is classified here.
 * `null` = the reason does not stop a broadcast.
 */
const BROADCAST_STATUS_REASON_BY_CHANNEL_REASON: Record<
  ChannelErrorReason,
  BroadcastStatusReason | null
> = {
  [ChannelErrorReason.ACCOUNT_POLICY_BLOCKED]: "accountPolicyBlocked",
  [ChannelErrorReason.ACCOUNT_SEND_RESTRICTED]: "accountSendRestricted",
  [ChannelErrorReason.RATE_LIMITED]: null,
}

export const resolveBroadcastStatusReason = (
  reason: ChannelErrorReason,
): BroadcastStatusReason | null =>
  BROADCAST_STATUS_REASON_BY_CHANNEL_REASON[reason]

export const truncateStatusErrorMessage = (message: string): string =>
  message.slice(0, BROADCAST_STATUS_ERROR_MESSAGE_MAX_LENGTH)

/** Spread into a status-changing UPDATE the customer drives (resume, move to draft). */
export const CLEARED_STATUS_REASON = {
  statusReason: null,
  statusErrorMessage: null,
  statusInboxId: null,
} as const
