"use client"

import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import ky from "ky"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type OptionItem = {
  id: string
  name: string
}

type OptionListResponse = {
  data: OptionItem[]
}

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

const buildSearchParamKey = (searchParams?: Record<string, string>) =>
  searchParams
    ? new URLSearchParams(
        Object.entries(searchParams).sort(([leftKey], [rightKey]) =>
          leftKey.localeCompare(rightKey),
        ),
      ).toString()
    : ""

const buildOptionCacheKey = ({
  workspaceId,
  endpoint,
  searchParams,
}: {
  workspaceId: string
  endpoint: string
  searchParams?: Record<string, string>
}) => `${workspaceId}:${endpoint}:${buildSearchParamKey(searchParams)}`

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

const loadOptionItems = ({
  workspaceId,
  endpoint,
  searchParams,
  cacheKey,
}: {
  workspaceId: string
  endpoint: string
  searchParams?: Record<string, string>
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

  const request = ky
    .get<OptionListResponse>(`/api/workspaces/${workspaceId}/${endpoint}`, {
      searchParams,
    })
    .json()
    .then((response) => {
      optionItemsCache.set(cacheKey, {
        items: response.data,
        expiresAt: Date.now() + OPTION_ITEMS_CACHE_TTL_MS,
      })
      optionItemsRequests.delete(cacheKey)
      return response.data
    })
    .catch((error: unknown) => {
      optionItemsRequests.delete(cacheKey)
      throw error
    })

  optionItemsRequests.set(cacheKey, request)
  return request
}

const useWorkspaceOptionEndpoint = (
  endpoint: string,
  searchParams?: Record<string, string>,
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
      endpoint,
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
      endpoint,
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
  }, [endpoint, searchParams, workspaceId])

  return useMemo(() => toSelectOptions(items), [items])
}

const whatsappBroadcastSearchParams = {
  channel: "whatsapp",
}

export const useBroadcastSelectOptions = (): SelectOption[] =>
  useWorkspaceOptionEndpoint(
    "broadcasts/options",
    whatsappBroadcastSearchParams,
  )

export const useReflinkSelectOptions = (): SelectOption[] =>
  useWorkspaceOptionEndpoint("ref-links/options")
