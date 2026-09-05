"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
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
  const [items, setItems] = useState<OptionItem[]>([])

  useEffect(() => {
    if (!workspaceId) {
      setItems([])
      return
    }

    const cacheKey = buildOptionCacheKey({
      workspaceId,
      source,
      searchParams,
    })
    const cachedItems = getCachedOptionItems(cacheKey)
    if (cachedItems) {
      setItems(cachedItems)
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
          setItems(responseItems)
        }
      })
      .catch(() => {
        if (active) {
          setItems([])
        }
      })

    return () => {
      active = false
    }
  }, [source, searchParams, workspaceId])

  return useMemo(() => toSelectOptions(items), [items])
}

const whatsappBroadcastSearchParams: BroadcastSearchParams = {
  channel: "whatsapp",
}

export const useBroadcastSelectOptions = (): SelectOption[] =>
  useWorkspaceOptionEndpoint(
    "broadcasts/options",
    whatsappBroadcastSearchParams,
  )

export const useReflinkSelectOptions = (): SelectOption[] =>
  useWorkspaceOptionEndpoint("ref-links/options")
