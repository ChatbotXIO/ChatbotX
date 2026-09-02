/**
 * The broadcasts table shows its empty state only when there are no rows
 * for the current filter at all. On an out-of-range page (e.g. the user
 * paginated past the last page and the filter changed under them), the
 * current page can have zero rows while `pageCount` is still >= 1 — in
 * that case the `DataTable`'s own "No results." row and pagination must
 * render so the user can navigate back to an in-range page.
 */
export const shouldShowBroadcastsEmptyState = (input: {
  rowCount: number
  pageCount: number
}): boolean => input.rowCount === 0 && input.pageCount === 0
