/** One sync per workspace per this window, measured from the latest run that reached its source. */
export const CONTACT_SYNC_COOLDOWN_MS = 4 * 60 * 60 * 1000

/**
 * Sweeper re-dispatches of a run that stopped without progress (timeout,
 * network error, 5xx, crash): the first chunk plus this many retries, so an
 * outage ends the run `failed` (`maxAttempts`) after 3 failed tries in a row.
 * A re-dispatch of a lost enqueue counts too; a chunk still waiting in the
 * queue does not. Recorded progress and a rate-limit pause reset the count.
 */
export const CONTACT_SYNC_MAX_ATTEMPTS = 2

/**
 * Wall-clock budget of one chunk job, far below the integration queue's lock
 * duration: a source call started near the end still finishes inside it.
 */
export const CONTACT_SYNC_CHUNK_BUDGET_MS = 60_000

/** Source pages read by one chunk, an upper bound beside the time budget, before it yields. */
export const CONTACT_SYNC_PAGES_PER_CHUNK = 20

/** Contacts asked per source page. */
export const CONTACT_SYNC_PAGE_SIZE = 500

/** Smallest page asked when the source keeps answering too large. */
export const CONTACT_SYNC_MIN_PAGE_SIZE = 25

/** Longest wait honoured when a source asks to slow down. */
export const CONTACT_SYNC_MAX_PAUSE_MS = 30 * 60 * 1000

/** Wait before a retry when the source gave no hint. */
export const CONTACT_SYNC_DEFAULT_PAUSE_MS = 60 * 1000

/**
 * Wait before trying a source again after a transient failure (5xx, network,
 * timeout). Each such retry without progress in between costs one of the
 * run's attempts (`CONTACT_SYNC_MAX_ATTEMPTS`); a recorded page resets them.
 */
export const CONTACT_SYNC_RETRY_DELAY_MS = 60 * 1000

/** Exhausted runs one sweep ends; a backlog drains over the next sweeps. */
export const CONTACT_SYNC_SWEEP_BATCH_SIZE = 100

/**
 * Contacts one source may settle in a run; past it the source ends
 * `partial`. Reading is finite anyway: every page with "more" has rows and a
 * cursor that moves forward within the snapshot.
 */
export const CONTACT_SYNC_MAX_CONTACTS_PER_ITEM = 12_500_000

export { CONTACT_SYNC_ERROR_CODES } from "@chatbotx.io/database/partials"

/** Why a source cannot be synced, shown next to it (localized by the builder). */
export const CONTACT_SYNC_INELIGIBLE_REASONS = {
  /** The page does not exist in AhaChat. */
  notInAhachat: "notInAhachat",
  /** More than one AhaChat record claims the page: nothing is imported. */
  pageAmbiguous: "pageAmbiguous",
  /** AhaChat could not be asked right now: retry. */
  ahachatUnavailable: "ahachatUnavailable",
} as const
export type ContactSyncIneligibleReason =
  (typeof CONTACT_SYNC_INELIGIBLE_REASONS)[keyof typeof CONTACT_SYNC_INELIGIBLE_REASONS]

/** `currentError` sentinels a run or one of its sources can end with. */
export const CONTACT_SYNC_RUN_ERRORS = {
  inboxUnavailable: "inboxUnavailable",
  channelUnsupported: "channelUnsupported",
  sourceUnavailable: "sourceUnavailable",
  sourceDisconnected: "sourceDisconnected",
  pageNotFound: "pageNotFound",
  pageLimitReached: "pageLimitReached",
  maxAttempts: "maxAttempts",
} as const

/** Pages one discovery request asks about (the source's own bound). */
export const CONTACT_SYNC_DISCOVERY_BATCH_SIZE = 100

/** Pages of one connect picker checked at the source: one discovery request. */
export const CONTACT_SYNC_PICKER_DISCOVERY_LIMIT =
  CONTACT_SYNC_DISCOVERY_BATCH_SIZE

/**
 * How long the connect picker waits for that answer before rendering without
 * it (normal history sync only); the request still finishes and fills the
 * discovery cache for the next render.
 */
export const CONTACT_SYNC_PICKER_DISCOVERY_BUDGET_MS = 4000

/**
 * After the source could not answer the picker (timeout, outage, 429), the
 * picker skips asking it for this long, so an outage costs one wait, not one
 * per render.
 */
export const CONTACT_SYNC_PICKER_UNAVAILABLE_BACKOFF_MS = 15_000

/** Hours a closed connect-import item may still hand off to the history sync. */
export const CONTACT_SYNC_FOLLOW_UP_MAX_AGE_HOURS = 24

/** Owed follow-ups one sweep hands off; the rest wait for the next sweep. */
export const CONTACT_SYNC_FOLLOW_UP_BATCH_SIZE = 50

// Defined with the schema (`@chatbotx.io/database/partials`); re-exported here
// for the callers that read them next to the other contact-sync constants.
// `followUpError` values: why an owed history sync will not happen.
export {
  CONTACT_SYNC_FOLLOW_UP_ERRORS,
  CONTACT_SYNC_MAX_SOURCES_PER_RUN,
  type ContactSyncFollowUpChannel,
  isContactSyncFollowUpChannel,
} from "@chatbotx.io/database/partials"

/** Why a page of a connect import fell back to a plain history sync. */
export const CONTACT_SYNC_CONNECT_FALLBACKS = {
  tooManyPages: "tooManyPages",
  workspaceBusy: "workspaceBusy",
  historyRunning: "historyRunning",
  channelUnsupported: "channelUnsupported",
  inboxNotConnected: "inboxNotConnected",
  notInAhachat: "notInAhachat",
  pageAmbiguous: "pageAmbiguous",
  ahachatUnavailable: "ahachatUnavailable",
} as const
export type ContactSyncConnectFallback =
  (typeof CONTACT_SYNC_CONNECT_FALLBACKS)[keyof typeof CONTACT_SYNC_CONNECT_FALLBACKS]
