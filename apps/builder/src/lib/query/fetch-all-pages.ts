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
 */
export async function fetchAllPages<TPageParam, TItem>({
  fetchPage,
  initialPageParam,
  maxPages,
}: FetchAllPagesOptions<TPageParam, TItem>): Promise<TItem[]> {
  const allItems: TItem[] = []
  let pageParam: TPageParam | undefined = initialPageParam

  for (let page = 0; page < maxPages && pageParam !== undefined; page++) {
    const { items, nextPageParam } = await fetchPage(pageParam)
    allItems.push(...items)
    pageParam = nextPageParam
  }

  return allItems
}
