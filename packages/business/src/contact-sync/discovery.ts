import type { ContactSyncProvider } from "@chatbotx.io/database/partials"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  CONTACT_SYNC_DISCOVERY_BATCH_SIZE,
  CONTACT_SYNC_INELIGIBLE_REASONS,
  type ContactSyncIneligibleReason,
} from "./constants"
import { readDiscoveryCache, writeDiscoveryCache } from "./discovery-cache"
import { contactSyncAdapters } from "./providers"
import type { ContactSyncInbox } from "./source-inboxes"
import type {
  ContactSyncDiscoveryEntry,
  ContactSyncDiscoveryStatus,
  ContactSyncPage,
  ContactSyncRequestScope,
} from "./types"

const log = getChildLogger("contact-sync-discovery")

export const discoveryKey = (page: ContactSyncPage) =>
  `${page.channel}:${page.pageId}`

export const pageOfInbox = (inbox: ContactSyncInbox): ContactSyncPage => ({
  channel: inbox.channel,
  pageId: inbox.sourceId,
})

/** Why a page that was not found cannot be imported; `null` when it was found. */
export const INELIGIBLE_REASON_BY_STATUS: Record<
  ContactSyncDiscoveryStatus,
  ContactSyncIneligibleReason | null
> = {
  found: null,
  absent: CONTACT_SYNC_INELIGIBLE_REASONS.notInAhachat,
  ambiguous: CONTACT_SYNC_INELIGIBLE_REASONS.pageAmbiguous,
  unavailable: CONTACT_SYNC_INELIGIBLE_REASONS.ahachatUnavailable,
}

const unavailableEntry = (
  page: ContactSyncPage,
): ContactSyncDiscoveryEntry => ({
  ...page,
  status: "unavailable",
  name: null,
  avatarUrl: null,
})

/**
 * Asks the source which of the inboxes' pages it has: deduped pairs in
 * batches of the source's own bound. A batch that fails (timeout, 429,
 * outage, bad keys) leaves its pages `unavailable` — retryable — and never
 * `absent`. The answer holds existence, a name and an avatar only; it is not
 * stored beyond a short bounded in-process cache (`discovery-cache.ts`): the
 * data export re-validates the page at the source on every request anyway.
 */
export const discoverContactSyncPages = (input: {
  provider: ContactSyncProvider
  scope: ContactSyncRequestScope
  inboxes: ContactSyncInbox[]
}): Promise<Map<string, ContactSyncDiscoveryEntry>> =>
  discoverPagesAtSource({
    provider: input.provider,
    scope: input.scope,
    pages: input.inboxes.map(pageOfInbox),
  })

/** Discoveries in flight, so concurrent renders asking about the same pages share one request. */
const inFlight = new Map<
  string,
  Promise<Map<string, ContactSyncDiscoveryEntry>>
>()
/** Upper bound of `inFlight` (one entry per distinct request still running). */
const MAX_IN_FLIGHT = 500

/** Test hook: forgets every discovery in flight. */
export const clearDiscoveryInFlight = () => inFlight.clear()

/** Same as `discoverContactSyncPages` for pages not connected yet (the connect picker). */
export const discoverPagesAtSource = (input: {
  provider: ContactSyncProvider
  scope: ContactSyncRequestScope
  pages: ContactSyncPage[]
}): Promise<Map<string, ContactSyncDiscoveryEntry>> => {
  const key = [
    input.provider,
    input.scope.workspaceId,
    ...[...new Set(input.pages.map(discoveryKey))].sort(),
  ].join("|")
  const running = inFlight.get(key)
  if (running) {
    return running
  }
  const request = askSource(input)
  if (inFlight.size < MAX_IN_FLIGHT) {
    inFlight.set(key, request)
    request.finally(() => inFlight.delete(key)).catch(() => undefined)
  }
  return request
}

const askSource = async (input: {
  provider: ContactSyncProvider
  scope: ContactSyncRequestScope
  pages: ContactSyncPage[]
}): Promise<Map<string, ContactSyncDiscoveryEntry>> => {
  const unique = new Map<string, ContactSyncPage>()
  for (const page of input.pages) {
    unique.set(discoveryKey(page), page)
  }
  const adapter = contactSyncAdapters[input.provider]
  const cacheScope = {
    provider: input.provider,
    workspaceId: input.scope.workspaceId,
  }
  const answers = new Map<string, ContactSyncDiscoveryEntry>()
  const pages: ContactSyncPage[] = []
  for (const [key, page] of unique) {
    const remembered = readDiscoveryCache(cacheScope, key)
    if (remembered) {
      answers.set(key, remembered)
    } else {
      pages.push(page)
    }
  }
  // One after the other: the source limits discovery per workspace.
  for (
    let offset = 0;
    offset < pages.length;
    offset += CONTACT_SYNC_DISCOVERY_BATCH_SIZE
  ) {
    const batch = pages.slice(
      offset,
      offset + CONTACT_SYNC_DISCOVERY_BATCH_SIZE,
    )
    try {
      for (const entry of await adapter.discoverPages(input.scope, batch)) {
        answers.set(discoveryKey(entry), entry)
        writeDiscoveryCache(cacheScope, discoveryKey(entry), entry)
      }
    } catch (err) {
      log.warn(
        { err, workspaceId: input.scope.workspaceId },
        "contact sync: discovery batch failed",
      )
    }
  }
  // A page the answer did not mention is not "absent": it was not answered.
  for (const page of pages) {
    if (!answers.has(discoveryKey(page))) {
      answers.set(discoveryKey(page), unavailableEntry(page))
    }
  }
  return answers
}
