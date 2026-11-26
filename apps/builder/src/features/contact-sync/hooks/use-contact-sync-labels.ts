"use client"

import type { ContactSyncIneligibleReason } from "@chatbotx.io/business/contact-sync"
import type {
  ContactSyncRunItemStatus,
  ContactSyncRunStatus,
} from "@chatbotx.io/database/partials"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { useTranslations } from "next-intl"
import { allInboxConfigs } from "@/features/inboxes/provider/inbox-hook"

const INELIGIBLE_REASON_KEYS = {
  notInAhachat: "contactSync.ineligible.notInAhachat",
  pageAmbiguous: "contactSync.ineligible.pageAmbiguous",
  ahachatUnavailable: "contactSync.ineligible.ahachatUnavailable",
} as const satisfies Record<ContactSyncIneligibleReason, string>

const RUN_STATUS_KEYS = {
  pending: "contactSync.status.pending",
  running: "contactSync.status.running",
  cancelling: "contactSync.status.cancelling",
  succeeded: "contactSync.status.succeeded",
  partial: "contactSync.status.partial",
  failed: "contactSync.status.failed",
  cancelled: "contactSync.status.cancelled",
} as const satisfies Record<
  ContactSyncRunStatus | ContactSyncRunItemStatus,
  string
>

const RUN_ERROR_KEYS = {
  pageNotFound: "contactSync.runErrors.pageNotFound",
  channelUnsupported: "contactSync.runErrors.channelUnsupported",
  inboxUnavailable: "contactSync.runErrors.inboxUnavailable",
  sourceUnavailable: "contactSync.runErrors.sourceUnavailable",
  sourceDisconnected: "contactSync.runErrors.sourceDisconnected",
  pageLimitReached: "contactSync.runErrors.pageLimitReached",
  maxAttempts: "contactSync.runErrors.maxAttempts",
} as const

/** Every label the sync UI derives from a stored value, through literal key maps. */
export const useContactSyncLabels = () => {
  const t = useTranslations()
  return {
    channel: (channel: ChannelType) =>
      channel in allInboxConfigs
        ? allInboxConfigs[channel as keyof typeof allInboxConfigs].label
        : channel,
    ineligibleReason: (reason: ContactSyncIneligibleReason) =>
      t(INELIGIBLE_REASON_KEYS[reason]),
    status: (status: ContactSyncRunStatus | ContactSyncRunItemStatus) =>
      t(RUN_STATUS_KEYS[status]),
    runError: (error: string | null) =>
      error && error in RUN_ERROR_KEYS
        ? t(RUN_ERROR_KEYS[error as keyof typeof RUN_ERROR_KEYS])
        : error,
  }
}
