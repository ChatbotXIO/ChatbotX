"use client"

import {
  type SocialPostFeedMode,
  type SocialPostFeedStatus,
  socialPostFeedModes,
  socialPostFeedStatuses,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  ProviderAvatar,
  ProviderNetworkIcon,
} from "@/features/social-accounts/components/provider-avatar"
import { PROVIDER_LABELS } from "@/features/social-posts/lib/composer-state"
import type { PublishDestinationOption } from "@/features/social-posts/lib/publish-destination-options"
import { SEARCH_DEBOUNCE_MS } from "../lib/feed-filters"

const ALL = "all"

export type FeedFilters = {
  destinationIds: readonly string[]
  mode: SocialPostFeedMode | null
  search: string
  status: SocialPostFeedStatus | null
}

const DestinationFilter = ({
  destinations,
  onChange,
  selectedIds,
}: {
  destinations: readonly PublishDestinationOption[]
  onChange: (ids: string[]) => void
  selectedIds: readonly string[]
}) => {
  const t = useTranslations()
  const toggle = (id: string, checked: boolean) =>
    onChange(
      checked
        ? [...selectedIds, id]
        : selectedIds.filter((current) => current !== id),
    )
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("posts.feeds.filters.destination")}
            className="h-8 justify-between gap-2"
            variant="outline"
          />
        }
      >
        {selectedIds.length === 0
          ? t("posts.feeds.filters.allDestinations")
          : t("posts.feeds.filters.destinationsSelected", {
              count: selectedIds.length,
            })}
        <ChevronDownIcon className="size-4 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {destinations.length === 0 ? (
          <p className="p-3 text-muted-foreground text-sm">
            {t("posts.feeds.filters.noDestinations")}
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {destinations.map((destination) => {
              const name = destination.name ?? destination.id
              return (
                <li key={destination.id}>
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    htmlFor={`feed-filter-destination-${destination.id}`}
                  >
                    <Checkbox
                      checked={selectedIds.includes(destination.id)}
                      id={`feed-filter-destination-${destination.id}`}
                      onCheckedChange={(checked) =>
                        toggle(destination.id, checked === true)
                      }
                    />
                    <ProviderAvatar
                      avatar={destination.avatar}
                      className="size-5"
                      provider={destination.provider}
                    />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <ProviderNetworkIcon
                      label={PROVIDER_LABELS[destination.provider]}
                      provider={destination.provider}
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Search, status, mode and destination filters of the Feeds list. */
export const FeedFilterBar = ({
  destinations,
  filters,
  hasFilters,
  onClear,
  onDestinationsChange,
  onModeChange,
  onSearchChange,
  onStatusChange,
}: {
  destinations: readonly PublishDestinationOption[]
  filters: FeedFilters
  hasFilters: boolean
  onClear: () => void
  onDestinationsChange: (ids: string[]) => void
  onModeChange: (mode: SocialPostFeedMode | null) => void
  onSearchChange: (search: string) => void
  onStatusChange: (status: SocialPostFeedStatus | null) => void
}) => {
  const t = useTranslations()
  const [draft, setDraft] = useState(filters.search)

  // The URL value changing from outside (Clear filters, back button) resets the box.
  useEffect(() => setDraft(filters.search), [filters.search])
  useEffect(() => {
    if (draft === filters.search) {
      return
    }
    const timer = setTimeout(() => onSearchChange(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, filters.search, onSearchChange])

  const statusItems = [
    { label: t("posts.feeds.filters.allStatuses"), value: ALL },
    ...socialPostFeedStatuses.options.map((value) => ({
      label: t(`posts.feeds.status.${value}`),
      value,
    })),
  ]
  const modeItems = [
    { label: t("posts.feeds.filters.allModes"), value: ALL },
    ...socialPostFeedModes.options.map((value) => ({
      label: t(`posts.feeds.mode.${value}`),
      value,
    })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t("posts.feeds.filters.search")}
          className="h-8 ps-8"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("posts.feeds.filters.searchPlaceholder")}
          type="search"
          value={draft}
        />
      </div>
      <Select
        items={statusItems}
        onValueChange={(value) => {
          const next = socialPostFeedStatuses.safeParse(value)
          onStatusChange(next.success ? next.data : null)
        }}
        value={filters.status ?? ALL}
      >
        <SelectTrigger
          aria-label={t("posts.feeds.filters.status")}
          className="h-8 w-44"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={modeItems}
        onValueChange={(value) => {
          const next = socialPostFeedModes.safeParse(value)
          onModeChange(next.success ? next.data : null)
        }}
        value={filters.mode ?? ALL}
      >
        <SelectTrigger
          aria-label={t("posts.feeds.filters.mode")}
          className="h-8 w-48"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modeItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DestinationFilter
        destinations={destinations}
        onChange={onDestinationsChange}
        selectedIds={filters.destinationIds}
      />
      {hasFilters ? (
        <Button onClick={onClear} size="sm" variant="ghost">
          <XIcon />
          {t("posts.feeds.filters.clear")}
        </Button>
      ) : null}
    </div>
  )
}
