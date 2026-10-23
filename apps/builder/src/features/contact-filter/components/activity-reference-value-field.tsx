"use client"

import type { ContactActivityValueSource } from "@chatbotx.io/database/partials"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

const SEARCH_DEBOUNCE_MS = 250

type ActivityReferenceValueFieldProps = {
  source: ContactActivityValueSource
  /** Values offered without a lookup (e.g. "No Topic"). */
  fixedOptions?: SelectOption[]
  /** Names of the values already chosen, so they render even off the first page. */
  selectedOptions?: SelectOption[]
}

/** First occurrence wins, so fixed and already-chosen options keep their label. */
const mergeOptions = (...groups: SelectOption[][]): SelectOption[] => {
  const seen = new Set<string>()
  return groups.flat().filter((option) => {
    if (seen.has(option.value)) {
      return false
    }
    seen.add(option.value)
    return true
  })
}

/**
 * Value picker for the activity-backed filters whose entity has no cheap full
 * list (keyword rules, WhatsApp Flows, email topics). Nothing is fetched until
 * this field is on screen, one bounded page is searched on the server, and the
 * selected values are named by id elsewhere, so it never grows with the
 * workspace.
 */
export const ActivityReferenceValueField = ({
  source,
  fixedOptions = [],
  selectedOptions = [],
}: ActivityReferenceValueFieldProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  // Every option this field has shown, so a value picked from one search keeps
  // its chip after the search changes (the next page may not contain it).
  const knownOptions = useRef(new Map<string, SelectOption>())
  const { watch } = useFormContext<{ value: string | string[] }>()
  const selectedValues = watch("value")

  useEffect(() => {
    const timeout = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timeout)
  }, [searchInput])

  const { data, isFetching, isError, refetch } = useQuery(
    orpc.contactFilterAPI.listActivityValueOptionsAPI.queryOptions({
      input: {
        workspaceId: workspaceId ?? "",
        source,
        search: search || undefined,
      },
      enabled: Boolean(workspaceId),
      // Keep the previous page on screen while a new search loads.
      placeholderData: keepPreviousData,
      // No mutation invalidates this key, and a rule/topic created a moment
      // ago must be pickable: refetch on each open rather than serve a stale
      // list (a bounded, indexed page; same reasoning as `useFilterValueLabels`).
      staleTime: 0,
    }),
  )

  const options = useMemo(() => {
    for (const option of data?.data ?? []) {
      knownOptions.current.set(option.value, option)
    }
    const selected = (
      Array.isArray(selectedValues) ? selectedValues : [selectedValues]
    ).flatMap((value) => {
      const known = value ? knownOptions.current.get(value) : undefined
      return known ? [known] : []
    })
    return mergeOptions(
      fixedOptions,
      selectedOptions,
      selected,
      data?.data ?? [],
    )
  }, [fixedOptions, selectedOptions, selectedValues, data])

  let emptyIndicator: ReactNode
  let statusIndicator: ReactNode
  if (isError) {
    statusIndicator = (
      <div className="px-2 py-1.5 text-center">
        <button
          className="text-sm underline"
          onClick={() => refetch()}
          type="button"
        >
          {t("states.error")}: {t("actions.retry")}
        </button>
      </div>
    )
    emptyIndicator = statusIndicator
  } else if (isFetching) {
    emptyIndicator = t("actions.loading")
  }

  return (
    <MultiSelectField
      emptyIndicator={emptyIndicator}
      hideSelectAll
      name="value"
      onSearchValueChange={setSearchInput}
      options={options}
      serverSearch
      statusIndicator={statusIndicator}
    />
  )
}
