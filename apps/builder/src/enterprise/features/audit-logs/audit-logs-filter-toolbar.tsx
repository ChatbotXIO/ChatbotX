"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { DateTimePicker } from "@chatbotx.io/ui/components/ui/date-picker"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type FormEvent, useMemo, useState } from "react"

export type AuditLogsFilterSelectOption = {
  id: string
  label: string
}

export type AuditLogsFilterToolbarSelectConfig = {
  paramKey: string
  value: string
  label: string
  allLabel: string
  options: AuditLogsFilterSelectOption[]
  idPrefix: string
}

type AuditLogsFilterToolbarProps = {
  from: string
  to: string
  keyword: string
  select: AuditLogsFilterToolbarSelectConfig
}

const ALL_VALUE = "__all"
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const dateKeyToDate = (value: string) => {
  if (!DATE_KEY_RE.test(value)) {
    return
  }

  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

const dateToDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function AuditLogsFilterToolbar({
  from,
  to,
  keyword,
  select,
}: AuditLogsFilterToolbarProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draft, setDraft] = useState({
    from,
    to,
    keyword,
    select: select.value,
  })

  const selectOptions = useMemo(
    () => [
      { label: select.allLabel, value: ALL_VALUE },
      ...select.options.map((option) => ({
        label: option.label,
        value: option.id,
      })),
    ],
    [select.allLabel, select.options],
  )

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const params = new URLSearchParams(searchParams)
    params.set("page", "1")

    const values: Record<string, string> = {
      from: draft.from,
      to: draft.to,
      keyword: draft.keyword,
      [select.paramKey]: draft.select,
    }
    for (const [key, value] of Object.entries(values)) {
      const trimmed = value.trim()
      if (trimmed) {
        params.set(key, trimmed)
      } else {
        params.delete(key)
      }
    }

    router.push(`${pathname}?${params.toString()}`)
  }

  const resetFilters = () => {
    const params = new URLSearchParams(searchParams)
    for (const key of ["from", "to", "keyword", select.paramKey, "page"]) {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <form
      className="flex flex-wrap items-end justify-end gap-2"
      onSubmit={applyFilters}
    >
      <div className="flex flex-col gap-1 text-muted-foreground text-xs">
        <span>{t("auditLogs.filters.from")}</span>
        <DateTimePicker
          className="h-8 w-36"
          displayFormat={{ hour24: "yyyy/MM/dd" }}
          granularity="day"
          onChange={(date) =>
            setDraft((current) => ({
              ...current,
              from: date ? dateToDateKey(date) : "",
            }))
          }
          value={dateKeyToDate(draft.from)}
        />
      </div>
      <div className="flex flex-col gap-1 text-muted-foreground text-xs">
        <span>{t("auditLogs.filters.to")}</span>
        <DateTimePicker
          className="h-8 w-36"
          displayFormat={{ hour24: "yyyy/MM/dd" }}
          granularity="day"
          onChange={(date) =>
            setDraft((current) => ({
              ...current,
              to: date ? dateToDateKey(date) : "",
            }))
          }
          value={dateKeyToDate(draft.to)}
        />
      </div>
      <div className="flex flex-col gap-1 text-muted-foreground text-xs">
        <span id={`${select.idPrefix}-label`}>{select.label}</span>
        <Select
          items={selectOptions}
          onValueChange={(value) => {
            const next = String(value)
            setDraft((current) => ({
              ...current,
              select: next === ALL_VALUE ? "" : next,
            }))
          }}
          value={draft.select || ALL_VALUE}
        >
          <SelectTrigger
            aria-labelledby={`${select.idPrefix}-label`}
            className="h-8 w-44"
            id={select.idPrefix}
          >
            <SelectValue placeholder={select.allLabel} />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor={`${select.idPrefix}-keyword`}
      >
        {t("auditLogs.filters.keyword")}
        <Input
          className="h-8 w-44"
          id={`${select.idPrefix}-keyword`}
          onChange={(event) =>
            setDraft((current) => ({ ...current, keyword: event.target.value }))
          }
          placeholder={t("auditLogs.filters.keywordPlaceholder")}
          value={draft.keyword}
        />
      </label>
      <Button size="sm" type="submit">
        {t("actions.filter")}
      </Button>
      <Button onClick={resetFilters} size="sm" type="button" variant="outline">
        {t("actions.reset")}
      </Button>
    </form>
  )
}
