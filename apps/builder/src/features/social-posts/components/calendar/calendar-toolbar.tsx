"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@chatbotx.io/ui/components/ui/toggle-group"
import { socialProviders } from "@chatbotx.io/utils/social-account"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  POSTS_CALENDAR_VIEWS,
  type PostsCalendarView,
} from "../../lib/calendar-view-state"
import { PROVIDER_LABELS } from "../../lib/composer-state"

const ALL = "all"

export type DestinationOption = {
  id: string
  label: string
  provider: SocialProvider
}

const isCalendarView = (
  value: string | undefined,
): value is PostsCalendarView =>
  (POSTS_CALENDAR_VIEWS as readonly string[]).includes(value ?? "")

const isProvider = (value: string): value is SocialProvider =>
  (socialProviders.options as readonly string[]).includes(value)

/** The Network and Page/profile filters, shared by the calendar and the Posts tab's composed-post list. */
export const CalendarFilters = ({
  destinationId,
  destinations,
  onDestinationChange,
  onProviderChange,
  provider,
}: {
  destinationId: string | null
  destinations: DestinationOption[]
  onDestinationChange: (destinationId: string | null) => void
  onProviderChange: (provider: SocialProvider | null) => void
  provider: SocialProvider | null
}) => {
  const t = useTranslations()
  const providerItems = [
    { label: t("posts.calendar.allNetworks"), value: ALL },
    ...socialProviders.options.map((value) => ({
      label: PROVIDER_LABELS[value],
      value,
    })),
  ]
  const destinationItems = [
    { label: t("posts.calendar.allDestinations"), value: ALL },
    ...destinations
      .filter((destination) => !provider || destination.provider === provider)
      .map((destination) => ({
        label: destination.label,
        value: destination.id,
      })),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={providerItems}
        onValueChange={(value) => {
          const next = String(value)
          onProviderChange(isProvider(next) ? next : null)
        }}
        value={provider ?? ALL}
      >
        <SelectTrigger
          aria-label={t("posts.calendar.network")}
          className="h-8 w-44"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providerItems.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={destinationItems}
        onValueChange={(value) => {
          const next = String(value)
          onDestinationChange(next === ALL ? null : next)
        }}
        value={destinationId ?? ALL}
      >
        <SelectTrigger
          aria-label={t("posts.calendar.destination")}
          className="h-8 w-52"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {destinationItems.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Period title, previous/today/next, the four views and the Network and Page/profile filters. */
export const CalendarToolbar = ({
  destinationId,
  destinations,
  onDestinationChange,
  onNext,
  onPrevious,
  onProviderChange,
  onToday,
  onViewChange,
  periodHidden,
  provider,
  title,
  view,
}: {
  destinationId: string | null
  destinations: DestinationOption[]
  onDestinationChange: (destinationId: string | null) => void
  onNext: () => void
  onPrevious: () => void
  onProviderChange: (provider: SocialProvider | null) => void
  onToday: () => void
  onViewChange: (view: PostsCalendarView) => void
  /** The list of every draft (or post needing attention) is not about a period. */
  periodHidden: boolean
  provider: SocialProvider | null
  title: string
  view: PostsCalendarView
}) => {
  const t = useTranslations()
  const viewLabels: Record<PostsCalendarView, string> = {
    day: t("posts.calendar.views.day"),
    list: t("posts.calendar.views.list"),
    month: t("posts.calendar.views.month"),
    week: t("posts.calendar.views.week"),
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {periodHidden ? (
          <span />
        ) : (
          <div className="flex items-center gap-1">
            <Button
              aria-label={t("posts.calendar.previous")}
              onClick={onPrevious}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon />
            </Button>
            <Button onClick={onToday} size="sm" variant="outline">
              {t("posts.calendar.today")}
            </Button>
            <Button
              aria-label={t("posts.calendar.next")}
              onClick={onNext}
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon />
            </Button>
            <h2 aria-live="polite" className="ms-3 font-semibold text-lg">
              {title}
            </h2>
          </div>
        )}
        <ToggleGroup
          aria-label={t("posts.calendar.viewLabel")}
          onValueChange={(values) => {
            const next = values[0]
            if (isCalendarView(next) && next !== view) {
              onViewChange(next)
            }
          }}
          value={[view]}
          variant="outline"
        >
          {POSTS_CALENDAR_VIEWS.map((value) => (
            <ToggleGroupItem className="px-3" key={value} value={value}>
              {viewLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <CalendarFilters
        destinationId={destinationId}
        destinations={destinations}
        onDestinationChange={onDestinationChange}
        onProviderChange={onProviderChange}
        provider={provider}
      />
    </div>
  )
}
