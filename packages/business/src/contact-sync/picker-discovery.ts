import type { ContactSyncProvider } from "@chatbotx.io/database/partials"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  CONTACT_SYNC_PICKER_DISCOVERY_BUDGET_MS,
  CONTACT_SYNC_PICKER_DISCOVERY_LIMIT,
  CONTACT_SYNC_PICKER_UNAVAILABLE_BACKOFF_MS,
} from "./constants"
import { discoverPagesAtSource, discoveryKey } from "./discovery"
import type { ContactSyncActor, ContactSyncPage } from "./types"

const log = getChildLogger("contact-sync-picker")

/**
 * Workspaces whose connect-picker discovery found the source unable to answer,
 * until when (epoch ms), so an outage costs one wait instead of one per render.
 * Per process, bounded; not re-exported from the package index.
 */
const pickerBackoffUntil = new Map<string, number>()
/** Upper bound of `pickerBackoffUntil`; expired entries are dropped first. */
const MAX_PICKER_BACKOFFS = 500

const isPickerBackingOff = (key: string, now = Date.now()) =>
  (pickerBackoffUntil.get(key) ?? 0) > now

const rememberPickerBackoff = (key: string, until: number) => {
  if (pickerBackoffUntil.size >= MAX_PICKER_BACKOFFS) {
    const now = Date.now()
    for (const [entryKey, entryUntil] of pickerBackoffUntil) {
      if (entryUntil <= now) {
        pickerBackoffUntil.delete(entryKey)
      }
    }
    if (pickerBackoffUntil.size >= MAX_PICKER_BACKOFFS) {
      return
    }
  }
  pickerBackoffUntil.set(key, until)
}

/** Test hook: forgets every picker backoff. */
export const clearPickerDiscoveryBackoff = () => pickerBackoffUntil.clear()

/** The promise's value, or `null` once `ms` passed first (the promise keeps running). */
const withinBudget = async <T>(promise: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([promise, expired])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ids of the pages the source has, among pages not connected yet (the
 * connect picker asks only these whether to import first). Bounded to
 * `CONTACT_SYNC_PICKER_DISCOVERY_LIMIT` pages and
 * `CONTACT_SYNC_PICKER_DISCOVERY_BUDGET_MS`; a source that cannot be asked
 * finds none (the picker falls back to the normal history sync) and is not
 * asked again for `CONTACT_SYNC_PICKER_UNAVAILABLE_BACKOFF_MS`.
 */
export const findContactSyncPagesAtSource = async (input: {
  provider: ContactSyncProvider
  workspaceId: string
  actor: ContactSyncActor
  pages: ContactSyncPage[]
}): Promise<string[]> => {
  const backoffKey = `${input.provider}:${input.workspaceId}`
  if (input.pages.length === 0 || isPickerBackingOff(backoffKey)) {
    return []
  }
  const pages = input.pages.slice(0, CONTACT_SYNC_PICKER_DISCOVERY_LIMIT)
  const answers = await withinBudget(
    discoverPagesAtSource({
      provider: input.provider,
      scope: { workspaceId: input.workspaceId, actor: input.actor },
      pages,
    }),
    CONTACT_SYNC_PICKER_DISCOVERY_BUDGET_MS,
  )
  if (!answers) {
    rememberPickerBackoff(
      backoffKey,
      Date.now() + CONTACT_SYNC_PICKER_UNAVAILABLE_BACKOFF_MS,
    )
    log.warn(
      { workspaceId: input.workspaceId, pages: pages.length },
      "contact sync: picker discovery ran past its budget",
    )
    return []
  }
  const statusOf = (page: ContactSyncPage) =>
    answers.get(discoveryKey(page))?.status
  if (pages.some((page) => statusOf(page) === "unavailable")) {
    rememberPickerBackoff(
      backoffKey,
      Date.now() + CONTACT_SYNC_PICKER_UNAVAILABLE_BACKOFF_MS,
    )
  }
  return pages
    .filter((page) => statusOf(page) === "found")
    .map((page) => page.pageId)
}
