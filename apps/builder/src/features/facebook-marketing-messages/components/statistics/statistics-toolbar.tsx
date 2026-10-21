"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Calendar } from "@chatbotx.io/ui/components/ui/calendar"
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
import { format } from "date-fns"
import { ArrowRightIcon, CalendarIcon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"
import {
  DAY_FORMAT,
  parseDay,
  STATISTICS_PRESETS,
  statisticsPresetRange,
} from "../../lib/statistics-range"

const SEARCH_DEBOUNCE_MS = 300

export function StatisticsToolbar({
  adAccountId,
  adAccounts,
  since,
  until,
  timezone,
  search,
  onAdAccountChange,
  onRangeChange,
  onSearchChange,
}: {
  adAccountId: string | null
  adAccounts: { id: string; name: string | null }[]
  since: string
  until: string
  timezone: string
  search: string
  onAdAccountChange: (adAccountId: string) => void
  onRangeChange: (range: { since: string; until: string }) => void
  onSearchChange: (search: string) => void
}) {
  const t = useTranslations()
  const [searchDraft, setSearchDraft] = useState(search)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>()

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  useEffect(() => {
    if (searchDraft === search) {
      return
    }
    const timer = setTimeout(
      () => onSearchChange(searchDraft),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [searchDraft, search, onSearchChange])

  const selected = draftRange ?? { from: parseDay(since), to: parseDay(until) }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="relative w-full md:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t(
            "facebookMarketingMessages.statistics.searchPlaceholder",
          )}
          className="pl-8"
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder={t(
            "facebookMarketingMessages.statistics.searchPlaceholder",
          )}
          value={searchDraft}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {adAccounts.length > 1 && adAccountId && (
          <Select
            items={adAccounts.map((account) => ({
              label: account.name ?? account.id,
              value: account.id,
            }))}
            onValueChange={(value) => value && onAdAccountChange(String(value))}
            value={adAccountId}
          >
            <SelectTrigger
              aria-label={t("facebookMarketingMessages.statistics.adAccount")}
              className="w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {adAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name ?? account.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Popover onOpenChange={(open) => !open && setDraftRange(undefined)}>
          <PopoverTrigger
            render={
              <Button
                aria-label={t("facebookMarketingMessages.statistics.dateRange")}
                size="sm"
                type="button"
                variant="outline"
              >
                <span>{since}</span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                <span>{until}</span>
                <CalendarIcon className="size-4 text-muted-foreground" />
              </Button>
            }
          />
          <PopoverContent align="end" className="flex w-auto gap-2 p-2">
            <div className="flex flex-col gap-1">
              {STATISTICS_PRESETS.map((preset) => (
                <Button
                  className="justify-start"
                  key={preset}
                  onClick={() => {
                    setDraftRange(undefined)
                    onRangeChange(statisticsPresetRange(preset, timezone))
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t(`facebookMarketingMessages.statistics.presets.${preset}`)}
                </Button>
              ))}
            </div>
            <Calendar
              defaultMonth={selected.from}
              mode="range"
              numberOfMonths={2}
              // Two clicks pick a range (same day twice = one day); driven by
              // the clicked day, not the picker's range, so the first click
              // always starts a new selection.
              onSelect={(_range, day) => {
                const start = draftRange?.from
                if (!start) {
                  setDraftRange({ from: day, to: undefined })
                  return
                }
                const [first, last] = start <= day ? [start, day] : [day, start]
                setDraftRange(undefined)
                onRangeChange({
                  since: format(first, DAY_FORMAT),
                  until: format(last, DAY_FORMAT),
                })
              }}
              selected={selected}
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground text-xs">
          {t("facebookMarketingMessages.statistics.timezoneHint", {
            timezone,
          })}
        </span>
      </div>
    </div>
  )
}
