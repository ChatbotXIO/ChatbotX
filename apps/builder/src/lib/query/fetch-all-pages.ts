type FetchAllPagesOptions<TPageParam, TItem> = {
  fetchPage: (pageParam: TPageParam) => Promise<{
    items: TItem[]
    nextPageParam: TPageParam | undefined
  }>
  initialPageParam: TPageParam
  maxPages: number
}

/**
 * Loops every page of a paginated list endpoint and flattens the result.
 * Used where an editor wants *all* pages immediately (not incremental
 * `fetchNextPage`), matching how these dialogs behaved under
 * `useSWRInfinite` before the TanStack Query migration.
 *
 * `initialPageParam` is itself `undefined` for cursor-based pagination's
 * first page (no cursor yet) — the loop must still run once in that case, so
 * it always fetches page 0 and only uses `nextPageParam !== undefined` to
 * decide whether to continue.
 */
export async function fetchAllPages<TPageParam, TItem>({
  fetchPage,
  initialPageParam,
  maxPages,
}: FetchAllPagesOptions<TPageParam, TItem>): Promise<TItem[]> {
  const allItems: TItem[] = []
  let pageParam = initialPageParam

  for (let page = 0; page < maxPages; page++) {
    const { items, nextPageParam } = await fetchPage(pageParam)
    allItems.push(...items)
    if (nextPageParam === undefined) {
      break
    }
    pageParam = nextPageParam
  }

  return allItems
}
