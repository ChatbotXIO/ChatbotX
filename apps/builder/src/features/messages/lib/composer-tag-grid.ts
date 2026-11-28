import { ORPCError } from "@orpc/client"
import type { TagToggleIntent } from "./tag-toggle-queue"

/** Tags fetched per page for the composer grid. */
export const COMPOSER_TAG_PAGE_SIZE = 50

/** Wait after the last keystroke before the search is sent. */
export const COMPOSER_TAG_SEARCH_DEBOUNCE_MS = 300

/** Cell height and the gap between cells and rows, in px (no container padding or background). */
export const COMPOSER_TAG_CELL_PX = 20
export const COMPOSER_TAG_GAP_PX = 1
export const COMPOSER_TAG_COLLAPSED_ROWS = 3
export const COMPOSER_TAG_COLLAPSED_MAX_PX =
  COMPOSER_TAG_CELL_PX * COMPOSER_TAG_COLLAPSED_ROWS +
  COMPOSER_TAG_GAP_PX * (COMPOSER_TAG_COLLAPSED_ROWS - 1)

/** Narrowest a cell may get, and the most cells on one row. */
export const COMPOSER_TAG_MIN_CELL_PX = 88
export const COMPOSER_TAG_MAX_COLUMNS = 10

/** Cells per row for a container `widthPx` wide. */
export const composerTagColumns = (widthPx: number): number =>
  Math.min(
    COMPOSER_TAG_MAX_COLUMNS,
    Math.max(1, Math.floor(widthPx / COMPOSER_TAG_MIN_CELL_PX)),
  )

/**
 * Splits `items` into rows of `columns`, the shorter remainder row FIRST (23
 * items at 10 columns: 3, 10, 10) so the full rows sit flush at the bottom.
 */
export const chunkRemainderFirst = <T>(
  items: readonly T[],
  columns: number,
): T[][] => {
  const size = Math.max(1, Math.floor(columns))
  const remainder = items.length % size
  const rows: T[][] = remainder > 0 ? [items.slice(0, remainder)] : []
  for (let start = remainder; start < items.length; start += size) {
    rows.push(items.slice(start, start + size))
  }
  return rows
}

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
  /** Whether the contact's last read says it has the tag. */
  applied: boolean
  tagId: string
  unsettled: ReadonlyMap<string, TagToggleIntent>
}): boolean => {
  const intent = input.unsettled.get(input.tagId)
  return intent ? intent === "add" : input.applied
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
