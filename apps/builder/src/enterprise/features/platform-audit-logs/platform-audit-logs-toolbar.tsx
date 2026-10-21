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
import type { PlatformAuditWorkspaceOption } from "./schema"
import type { ListPlatformAuditLogsRequest } from "./schema/query"

type PlatformAuditLogsToolbarProps = Pick<
  ListPlatformAuditLogsRequest,
  "from" | "to" | "keyword" | "workspaceId"
> & {
  workspaces: PlatformAuditWorkspaceOption[]
}

const ALL_WORKSPACES_VALUE = "__all_workspaces"
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

export function PlatformAuditLogsToolbar({
  from,
  to,
  keyword,
  workspaceId,
  workspaces,
}: PlatformAuditLogsToolbarProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draft, setDraft] = useState({ from, to, keyword, workspaceId })
  const workspaceOptions = useMemo(
    () => [
      {
        label: t("auditLogs.filters.allWorkspaces"),
        value: ALL_WORKSPACES_VALUE,
      },
      ...workspaces.map((workspace) => ({
        label: workspace.label,
        value: workspace.id,
      })),
    ],
    [workspaces, t],
  )

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const params = new URLSearchParams(searchParams)
    params.set("page", "1")

    for (const key of ["from", "to", "keyword", "workspaceId"] as const) {
      const value = draft[key].trim()
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    router.push(`${pathname}?${params.toString()}`)
  }

  const resetFilters = () => {
    const params = new URLSearchParams(searchParams)
    for (const key of [
      "from",
      "to",
      "keyword",
      "workspaceId",
      "page",
    ] as const) {
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
        <span id="platform-audit-log-workspace-label">
          {t("fields.workspace.label")}
        </span>
        <Select
          items={workspaceOptions}
          onValueChange={(value) => {
            const nextWorkspaceId = String(value)
            setDraft((current) => ({
              ...current,
              workspaceId:
                nextWorkspaceId === ALL_WORKSPACES_VALUE ? "" : nextWorkspaceId,
            }))
          }}
          value={draft.workspaceId || ALL_WORKSPACES_VALUE}
        >
          <SelectTrigger
            aria-labelledby="platform-audit-log-workspace-label"
            className="h-8 w-44"
            id="platform-audit-log-workspace"
          >
            <SelectValue placeholder={t("auditLogs.filters.allWorkspaces")} />
          </SelectTrigger>
          <SelectContent>
            {workspaceOptions.map((workspace) => (
              <SelectItem key={workspace.value} value={workspace.value}>
                {workspace.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label
        className="flex flex-col gap-1 text-muted-foreground text-xs"
        htmlFor="platform-audit-log-keyword"
      >
        {t("auditLogs.filters.keyword")}
        <Input
          className="h-8 w-44"
          id="platform-audit-log-keyword"
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
