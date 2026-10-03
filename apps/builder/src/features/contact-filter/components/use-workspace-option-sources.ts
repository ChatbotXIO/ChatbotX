"use client"

import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { client } from "@/lib/orpc/orpc"

type OptionItem = {
  id: string
  name: string
}

type OptionSource = "broadcasts/options" | "ref-links/options"

type BroadcastSearchParams = { channel: ChannelType }

type OptionItemsCacheEntry = {
  items: OptionItem[]
  expiresAt: number
}

type OptionItemsState = {
  cacheKey: string | undefined
  items: OptionItem[]
}

const OPTION_ITEMS_CACHE_TTL_MS = 60_000
const optionItemsCache = new Map<string, OptionItemsCacheEntry>()
const optionItemsRequests = new Map<string, Promise<OptionItem[]>>()

const toSelectOptions = (items: OptionItem[]): SelectOption[] =>
  items.map((item) => ({
    label: item.name,
    value: item.id,
  }))

const buildSearchParamKey = (searchParams?: BroadcastSearchParams) =>
  searchParams
    ? new URLSearchParams(
        Object.entries(searchParams).sort(([leftKey], [rightKey]) =>
          leftKey.localeCompare(rightKey),
        ),
      ).toString()
    : ""

const buildOptionCacheKey = ({
  workspaceId,
  source,
  searchParams,
}: {
  workspaceId: string
  source: OptionSource
  searchParams?: BroadcastSearchParams
}) => `${workspaceId}:${source}:${buildSearchParamKey(searchParams)}`

const getCachedOptionItems = (cacheKey: string): OptionItem[] | undefined => {
  const cachedEntry = optionItemsCache.get(cacheKey)
  if (!cachedEntry) {
    return
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    optionItemsCache.delete(cacheKey)
    return
  }

  return cachedEntry.items
}

const optionFetchers: Record<
  OptionSource,
  (
    workspaceId: string,
    searchParams?: BroadcastSearchParams,
  ) => Promise<OptionItem[]>
> = {
  "broadcasts/options": async (workspaceId, searchParams) => {
    const { data } = await client.broadcastAPIs.privateListBroadcastOptionsAPI({
      workspaceId,
      channel: searchParams?.channel ?? "whatsapp",
    })
    return data
  },
  "ref-links/options": async (workspaceId) => {
    const { data } =
      await client.refLinksAPI.listRefLinkOptionsAuthenticatedAPI({
        workspaceId,
      })
    return data
  },
}

const loadOptionItems = ({
  workspaceId,
  source,
  searchParams,
  cacheKey,
}: {
  workspaceId: string
  source: OptionSource
  searchParams?: BroadcastSearchParams
  cacheKey: string
}) => {
  const cachedItems = getCachedOptionItems(cacheKey)
  if (cachedItems) {
    return Promise.resolve(cachedItems)
  }

  const pendingRequest = optionItemsRequests.get(cacheKey)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = optionFetchers[source](workspaceId, searchParams)
    .then((items) => {
      optionItemsCache.set(cacheKey, {
        items,
        expiresAt: Date.now() + OPTION_ITEMS_CACHE_TTL_MS,
      })
      optionItemsRequests.delete(cacheKey)
      return items
    })
    .catch((error: unknown) => {
      optionItemsRequests.delete(cacheKey)
      throw error
    })

  optionItemsRequests.set(cacheKey, request)
  return request
}

const useWorkspaceOptionEndpoint = (
  source: OptionSource,
  searchParams?: BroadcastSearchParams,
): SelectOption[] => {
  const { workspaceId } = useParams<{ workspaceId?: string }>()
  const cacheKey = useMemo(
    () =>
      workspaceId
        ? buildOptionCacheKey({ workspaceId, source, searchParams })
        : undefined,
    [searchParams, source, workspaceId],
  )
  const [state, setState] = useState<OptionItemsState>({
    cacheKey: undefined,
    items: [],
  })

  useEffect(() => {
    if (!(workspaceId && cacheKey)) {
      setState({ cacheKey, items: [] })
      return
    }

    const cachedItems = getCachedOptionItems(cacheKey)
    if (cachedItems) {
      setState({ cacheKey, items: cachedItems })
      return
    }

    let active = true

    loadOptionItems({
      workspaceId,
      source,
      searchParams,
      cacheKey,
    })
      .then((responseItems) => {
        if (active) {
          setState({ cacheKey, items: responseItems })
        }
      })
      .catch(() => {
        if (active) {
          setState({ cacheKey, items: [] })
        }
      })

    return () => {
      active = false
    }
  }, [cacheKey, source, searchParams, workspaceId])

  return useMemo(
    () => (state.cacheKey === cacheKey ? toSelectOptions(state.items) : []),
    [cacheKey, state],
  )
}

export const useBroadcastSelectOptions = (
  channel?: ChannelType,
): SelectOption[] => {
  const searchParams = useMemo<BroadcastSearchParams>(
    () => ({ channel: channel ?? channelTypes.enum.whatsapp }),
    [channel],
  )

  return useWorkspaceOptionEndpoint("broadcasts/options", searchParams)
}

export const useReflinkSelectOptions = (): SelectOption[] =>
  useWorkspaceOptionEndpoint("ref-links/options")

type ChannelPostOption = {
  caption: string | null
  externalPostId: string
  id: string
  inboxName: string
  channel: ChannelType
  permalink: string | null
  thumbnailUrl: string | null
}

type ChannelPostOptionsPage = {
  items: ChannelPostOption[]
  nextCursor?: { id: string; sortAt: string }
}

type ChannelPostOptionsState = ChannelPostOptionsPage & {
  cacheKey: string | undefined
}

export type ChannelPostOptionsResult = {
  error: boolean
  isLoading: boolean
  onReachEnd: () => void
  onSearchValueChange: (value: string) => void
  options: SelectOption[]
  retry: () => void
}

type ChannelPostOptionsCacheEntry = {
  expiresAt: number
  items: ChannelPostOption[]
  nextCursor?: { id: string; sortAt: string }
}

const splitIntoChannelPostBatches = (ids: string[]): string[][] => {
  const batches: string[][] = []
  for (let index = 0; index < ids.length; index += 100) {
    batches.push(ids.slice(index, index + 100))
  }
  return batches
}

const channelPostOptionsCache = new Map<string, ChannelPostOptionsCacheEntry>()
const channelPostOptionsRequests = new Map<
  string,
  Promise<ChannelPostOptionsPage>
>()
const channelPostSelectedOptionsRequests = new Map<
  string,
  Promise<ChannelPostOption[]>
>()

const buildChannelPostOptionsCacheKey = ({
  workspaceId,
  search,
  cursor,
}: {
  workspaceId: string
  search: string
  cursor?: { id: string; sortAt: string }
}) =>
  `${workspaceId}:channel-posts/options:${search}:${cursor?.sortAt ?? ""}:${cursor?.id ?? ""}`

const loadChannelPostOptionsPage = ({
  workspaceId,
  search,
  cursor,
}: {
  workspaceId: string
  search: string
  cursor?: { id: string; sortAt: string }
}): Promise<ChannelPostOptionsPage> => {
  const cacheKey = buildChannelPostOptionsCacheKey({
    workspaceId,
    search,
    cursor,
  })
  const cached = channelPostOptionsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve({
      items: cached.items,
      nextCursor: cached.nextCursor,
    })
  }
  if (cached) {
    channelPostOptionsCache.delete(cacheKey)
  }

  const pendingRequest = channelPostOptionsRequests.get(cacheKey)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = client.channelPostAPIs
    .privateListChannelPostOptionsAPI({
      workspaceId,
      cursor,
      limit: 30,
      ...(search ? { search } : {}),
    })
    .then((page) => {
      channelPostOptionsCache.set(cacheKey, {
        items: page.items,
        expiresAt: Date.now() + OPTION_ITEMS_CACHE_TTL_MS,
        nextCursor: page.nextCursor,
      })
      channelPostOptionsRequests.delete(cacheKey)
      return page
    })
    .catch((error: unknown) => {
      channelPostOptionsRequests.delete(cacheKey)
      throw error
    })

  channelPostOptionsRequests.set(cacheKey, request)
  return request
}

const loadSelectedChannelPostOptions = ({
  ids,
  workspaceId,
}: {
  ids: string[]
  workspaceId: string
}): Promise<ChannelPostOption[]> => {
  const cacheKey = `${workspaceId}:selected:${[...ids].sort().join(",")}`
  const pendingRequest = channelPostSelectedOptionsRequests.get(cacheKey)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = client.channelPostAPIs
    .privateGetChannelPostOptionsByIdsAPI({ ids, workspaceId })
    .then((response) => response.data)
    .finally(() => {
      channelPostSelectedOptionsRequests.delete(cacheKey)
    })

  channelPostSelectedOptionsRequests.set(cacheKey, request)
  return request
}

const toChannelPostSelectOption = (
  item: ChannelPostOption,
  fallbackLabel: string,
): SelectOption => ({
  channel: item.channel,
  description: item.inboxName,
  href: item.permalink ?? undefined,
  label: item.caption?.trim() || `${fallbackLabel} · ${item.externalPostId}`,
  thumbnailUrl: item.thumbnailUrl ?? undefined,
  value: item.id,
})

/**
 * Loads ChannelPost options page by page. Search terms and keyset cursors are
 * part of the short-lived cache key, so opening several filter dialogs does
 * not repeat the same request while a changed search never reuses stale rows.
 */
export const useChannelPostSelectOptions = (
  selectedIds: string[] = [],
): ChannelPostOptionsResult => {
  const { workspaceId } = useParams<{ workspaceId?: string }>()
  const t = useTranslations()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [retryNonce, setRetryNonce] = useState(0)
  const [state, setState] = useState<ChannelPostOptionsState>({
    cacheKey: undefined,
    items: [],
  })
  const [resolvedSelectedItems, setResolvedSelectedItems] = useState<
    ChannelPostOption[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const loadingNextPage = useRef(false)
  const loadedSelectedIds = useRef(new Set<string>())
  const selectedItemsWorkspaceId = useRef<string | undefined>(undefined)
  const currentSelectedRequestGeneration = useRef(retryNonce)
  currentSelectedRequestGeneration.current = retryNonce

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const rootCacheKey = workspaceId
    ? buildChannelPostOptionsCacheKey({ workspaceId, search })
    : undefined
  const currentCacheKey = useRef(rootCacheKey)
  currentCacheKey.current = rootCacheKey

  useEffect(() => {
    if (!(workspaceId && rootCacheKey)) {
      setState({ cacheKey: rootCacheKey, items: [] })
      setError(false)
      setIsLoading(false)
      return
    }

    let active = true
    const requestGeneration = retryNonce
    setError(false)
    setIsLoading(true)
    loadChannelPostOptionsPage({ workspaceId, search }).then(
      (page) => {
        if (active && requestGeneration === retryNonce) {
          setState({ ...page, cacheKey: rootCacheKey })
          setIsLoading(false)
        }
      },
      () => {
        if (active && requestGeneration === retryNonce) {
          setState({ cacheKey: rootCacheKey, items: [] })
          setError(true)
          setIsLoading(false)
        }
      },
    )

    return () => {
      active = false
    }
  }, [retryNonce, rootCacheKey, search, workspaceId])

  const onReachEnd = useCallback(() => {
    if (
      !(workspaceId && state.nextCursor) ||
      state.cacheKey !== rootCacheKey ||
      loadingNextPage.current
    ) {
      return
    }

    const requestCacheKey = rootCacheKey
    loadingNextPage.current = true
    setError(false)
    loadChannelPostOptionsPage({
      workspaceId,
      search,
      cursor: state.nextCursor,
    })
      .then(
        (page) => {
          setState((current) => {
            if (
              current.cacheKey !== requestCacheKey ||
              currentCacheKey.current !== requestCacheKey
            ) {
              return current
            }
            const existingIds = new Set(current.items.map((item) => item.id))
            return {
              cacheKey: current.cacheKey,
              items: [
                ...current.items,
                ...page.items.filter((item) => !existingIds.has(item.id)),
              ],
              nextCursor: page.nextCursor,
            }
          })
        },
        () => {
          if (currentCacheKey.current === requestCacheKey) {
            setError(true)
          }
        },
      )
      .finally(() => {
        loadingNextPage.current = false
      })
  }, [rootCacheKey, search, state.cacheKey, state.nextCursor, workspaceId])

  const selectedIdsKey = selectedIds.join(",")
  const selectedIdsForRequest = useMemo(
    () => (selectedIdsKey ? selectedIdsKey.split(",") : []),
    [selectedIdsKey],
  )
  const selectedIdsSet = useMemo(
    () => new Set(selectedIdsForRequest),
    [selectedIdsForRequest],
  )

  useEffect(() => {
    if (!workspaceId) {
      loadedSelectedIds.current.clear()
      selectedItemsWorkspaceId.current = undefined
      setResolvedSelectedItems([])
      return
    }

    if (selectedItemsWorkspaceId.current !== workspaceId) {
      loadedSelectedIds.current.clear()
      selectedItemsWorkspaceId.current = workspaceId
      setResolvedSelectedItems([])
    }

    const missingIds = selectedIdsForRequest.filter(
      (id) => !loadedSelectedIds.current.has(id),
    )
    if (missingIds.length === 0) {
      return
    }
    let active = true
    const requestGeneration = retryNonce
    Promise.allSettled(
      splitIntoChannelPostBatches(missingIds).map((ids) =>
        loadSelectedChannelPostOptions({ ids, workspaceId }).then((items) => ({
          ids,
          items,
        })),
      ),
    ).then((results) => {
      if (
        !active ||
        requestGeneration !== currentSelectedRequestGeneration.current
      ) {
        return
      }

      const successfulResults = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      )
      for (const { ids } of successfulResults) {
        for (const id of ids) {
          loadedSelectedIds.current.add(id)
        }
      }
      if (successfulResults.length > 0) {
        const successfulIds = new Set(
          successfulResults.flatMap(({ ids }) => ids),
        )
        setResolvedSelectedItems((current) => [
          ...successfulResults.flatMap(({ items }) => items),
          ...current.filter((item) => !successfulIds.has(item.id)),
        ])
      }
      if (successfulResults.length !== results.length) {
        setError(true)
      }
    })

    return () => {
      active = false
    }
  }, [retryNonce, selectedIdsForRequest, workspaceId])

  const fallbackLabel = t("condition.postWithoutCaption")
  const retry = useCallback(() => {
    if (rootCacheKey) {
      channelPostOptionsCache.delete(rootCacheKey)
    }
    setError(false)
    setRetryNonce((current) => current + 1)
  }, [rootCacheKey])

  return {
    error,
    isLoading,
    onReachEnd,
    onSearchValueChange: setSearchInput,
    options: useMemo(
      () =>
        state.cacheKey === rootCacheKey
          ? [
              ...resolvedSelectedItems.filter((item) =>
                selectedIdsSet.has(item.id),
              ),
              ...state.items,
            ]
              .filter(
                (item, index, allItems) =>
                  allItems.findIndex(
                    (candidate) => candidate.id === item.id,
                  ) === index,
              )
              .map((item) => toChannelPostSelectOption(item, fallbackLabel))
          : [],
      [
        fallbackLabel,
        resolvedSelectedItems,
        rootCacheKey,
        selectedIdsSet,
        state,
      ],
    ),
    retry,
  }
}
