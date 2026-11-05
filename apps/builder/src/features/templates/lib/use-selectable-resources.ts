import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { orpc } from "@/lib/orpc/query"
import { useDebouncedValue } from "./use-debounced-value"

const PAGE_SIZE = 100
/** The largest page `listSelectableResourcesAPI` accepts. */
const MAX_PAGE_SIZE = 200
const SEARCH_DEBOUNCE_MS = 300

type Input = {
  workspaceId: string
  category: TemplateCategory
  keyword: string
  onTotalChange?: (total: number) => void
}

/**
 * The resources of one category, paged, plus the unfiltered facts that
 * "select all" depends on.
 *
 * Two queries, both keyed by their inputs so a slow response can never land
 * on a newer search: the unfiltered one always runs and is the only source of
 * `total` and `allIds` (a search's `total` is its match count, and its ids a
 * subset, so they must never narrow what "select all" means); the search one
 * runs only while a keyword is typed (debounced).
 */
export const useSelectableResources = ({
  workspaceId,
  category,
  keyword,
  onTotalChange,
}: Input) => {
  const queryClient = useQueryClient()
  const searchKeyword = useDebouncedValue(keyword.trim(), SEARCH_DEBOUNCE_MS)
  const isSearching = searchKeyword !== ""

  const pagedOptions = (keywordFilter: string | undefined) =>
    orpc.templatesAPI.listSelectableResourcesAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        category,
        keyword: keywordFilter,
        cursor,
        limit: PAGE_SIZE,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    })

  const unfiltered = useInfiniteQuery(pagedOptions(undefined))
  const search = useInfiniteQuery({
    ...pagedOptions(searchKeyword),
    enabled: isSearching,
  })
  const shown = isSearching ? search : unfiltered

  const firstPage = unfiltered.data?.pages[0]
  const total = firstPage?.total ?? 0
  const allIds = firstPage?.allIds

  const onTotalChangeRef = useRef(onTotalChange)
  onTotalChangeRef.current = onTotalChange
  const knownTotal = firstPage?.total
  useEffect(() => {
    if (knownTotal !== undefined) {
      onTotalChangeRef.current?.(knownTotal)
    }
  }, [knownTotal])

  /**
   * The exact unfiltered id list, for a category too big for `allIds`: walks
   * every page, since the API serves at most `MAX_PAGE_SIZE` rows per call.
   */
  const fetchAllIds = async (): Promise<string[]> => {
    const ids: string[] = []
    let cursor: string | undefined
    do {
      const page = await queryClient.fetchQuery(
        orpc.templatesAPI.listSelectableResourcesAPI.queryOptions({
          input: { workspaceId, category, cursor, limit: MAX_PAGE_SIZE },
        }),
      )
      ids.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return ids
  }

  return {
    items: shown.data?.pages.flatMap((page) => page.items) ?? [],
    total,
    allIds,
    // Waiting on the typed keyword to settle also counts as loading.
    isLoading: shown.isFetching || keyword.trim() !== searchKeyword,
    isError: shown.isError && !shown.data,
    hasNextPage: shown.hasNextPage,
    isFetchingNextPage: shown.isFetchingNextPage,
    fetchNextPage: shown.fetchNextPage,
    refetch: shown.refetch,
    fetchAllIds,
  }
}
