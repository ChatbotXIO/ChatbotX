import type {
  ContactSyncProvider,
  ContactSyncSourceChannel,
} from "@chatbotx.io/database/partials"
import type { ContactSyncMappingPage } from "@chatbotx.io/database/repositories"
import {
  CONTACT_SYNC_ERROR_CODES,
  CONTACT_SYNC_MAX_SOURCES_PER_RUN,
  type ContactSyncIneligibleReason,
} from "./constants"
import { INELIGIBLE_REASON_BY_STATUS } from "./discovery"
import { contactSyncException } from "./errors"
import type { ContactSyncInbox } from "./source-inboxes"
import type {
  ContactSyncDiscoveryEntry,
  ContactSyncDiscoveryStatus,
  ContactSyncPage,
} from "./types"

/** A page of the workspace a run can read from, with what the source said of it. */
export type ContactSyncSource = {
  inboxId: string
  inboxName: string
  channel: ContactSyncSourceChannel
  /** The page's id on the platform. */
  accountId: string
  provider: ContactSyncProvider
  discovery: ContactSyncDiscoveryStatus
  /** The page's name and avatar at the source (when found). */
  sourceName: string | null
  sourceAvatarUrl: string | null
  eligible: boolean
  ineligibleReason: ContactSyncIneligibleReason | null
}

/** A run's source list must be non-empty, bounded and free of repeats. */
export const assertSourceListShape = (sources: { inboxId: string }[]): void => {
  if (sources.length === 0) {
    throw contactSyncException(
      CONTACT_SYNC_ERROR_CODES.noSources,
      "Choose at least one source",
    )
  }
  if (sources.length > CONTACT_SYNC_MAX_SOURCES_PER_RUN) {
    throw contactSyncException(
      CONTACT_SYNC_ERROR_CODES.tooManySources,
      `At most ${CONTACT_SYNC_MAX_SOURCES_PER_RUN} sources per sync`,
    )
  }
  const inboxIds = sources.map((source) => source.inboxId)
  if (new Set(inboxIds).size !== inboxIds.length) {
    throw contactSyncException(
      CONTACT_SYNC_ERROR_CODES.duplicateSource,
      "A source is listed twice",
    )
  }
}

/**
 * Refuses a page that cannot be synced. A source that could not be asked is
 * a retryable 503, distinct from a page it does not have.
 */
export const assertSourceEligible = (source: ContactSyncSource): void => {
  if (source.eligible) {
    return
  }
  if (source.discovery === "unavailable") {
    throw contactSyncException(
      CONTACT_SYNC_ERROR_CODES.sourceUnavailable,
      "AhaChat could not be reached: retry shortly",
      503,
    )
  }
  throw contactSyncException(
    CONTACT_SYNC_ERROR_CODES.sourceNotEligible,
    `Source ${source.inboxId} cannot be synced: ${source.ineligibleReason}`,
  )
}

export const toSource = (
  provider: ContactSyncProvider,
  inbox: ContactSyncInbox,
  entry: ContactSyncDiscoveryEntry | undefined,
): ContactSyncSource => {
  const discovery = entry?.status ?? "unavailable"
  const ineligibleReason = INELIGIBLE_REASON_BY_STATUS[discovery]
  return {
    inboxId: inbox.id,
    inboxName: inbox.name,
    channel: inbox.channel,
    accountId: inbox.sourceId,
    provider,
    discovery,
    sourceName: entry?.name ?? null,
    sourceAvatarUrl: entry?.avatarUrl ?? null,
    eligible: ineligibleReason === null,
    ineligibleReason,
  }
}

/** The mapping scope of a page of a provider. */
export const toMappingPage = (
  provider: ContactSyncProvider,
  page: ContactSyncPage,
): ContactSyncMappingPage => ({
  provider,
  channel: page.channel,
  pageId: page.pageId,
})
