import { ORPCError } from "@orpc/client"
import type { TagToggleIntent } from "./tag-toggle-queue"

/** Tags fetched per page for the composer grid. */
export const COMPOSER_TAG_PAGE_SIZE = 50

/** Wait after the last keystroke before the search is sent. */
export const COMPOSER_TAG_SEARCH_DEBOUNCE_MS = 300

/** Height of one chip row plus its gap, in px; the collapsed grid shows 3 rows. */
export const COMPOSER_TAG_ROW_PX = 30
export const COMPOSER_TAG_COLLAPSED_ROWS = 3
export const COMPOSER_TAG_COLLAPSED_MAX_PX =
  COMPOSER_TAG_ROW_PX * COMPOSER_TAG_COLLAPSED_ROWS

export const composerTagDisabledReasons = [
  "noContact",
  "blocked",
  "noAccess",
] as const
export type ComposerTagDisabledReason =
  (typeof composerTagDisabledReasons)[number]

type DisabledReasonInput = {
  contactId: string | null
  isBlocked: boolean
  /** The contact could not be read: no contacts permission or outside the member's scope. */
  contactUnavailable: boolean
}

/** Why the grid cannot change tags, or null when it can. First match wins. */
export const resolveComposerTagDisabledReason = (
  input: DisabledReasonInput,
): ComposerTagDisabledReason | null => {
  if (!input.contactId) {
    return "noContact"
  }
  if (input.isBlocked) {
    return "blocked"
  }
  if (input.contactUnavailable) {
    return "noAccess"
  }
  return null
}

type PageInfo = { pageCount: number }

/** Page-numbered pagination for `useInfiniteQuery`: the next page, or undefined at the end. */
export const nextTagPageParam = (
  lastPage: PageInfo,
  loadedPages: readonly unknown[],
): number | undefined =>
  loadedPages.length < lastPage.pageCount ? loadedPages.length + 1 : undefined

/**
 * Whether a tag shows as applied: the agent's unsettled intent wins over the
 * contact's last read, so the chip reacts at once and never flashes back.
 */
export const isTagShownApplied = (input: {
  tagId: string
  appliedTagIds: ReadonlySet<string>
  unsettled: ReadonlyMap<string, TagToggleIntent>
}): boolean => {
  const intent = input.unsettled.get(input.tagId)
  return intent ? intent === "add" : input.appliedTagIds.has(input.tagId)
}

/** HTTP statuses that mean "this member cannot read this contact". */
const CONTACT_ACCESS_STATUSES: ReadonlySet<number> = new Set([403, 404])

/**
 * Whether a failed contact read means the member has no access (not found or
 * forbidden: the server answers not-found for a contact outside their scope).
 * Any other failure (network, 5xx) is a load error to retry, not a lock.
 */
export const isContactAccessError = (error: unknown): boolean =>
  error instanceof ORPCError && CONTACT_ACCESS_STATUSES.has(error.status)

/** Keeps the first occurrence of each id: pages can overlap when tags change between fetches. */
export const dedupeById = <T extends { id: string }>(
  items: readonly T[],
): T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}
