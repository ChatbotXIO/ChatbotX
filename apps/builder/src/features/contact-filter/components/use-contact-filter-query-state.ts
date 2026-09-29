"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  type ContactFilterCriteria,
  contactFilterCriteriaSchema,
} from "../schema"

export const EMPTY_CONTACT_FILTER: ContactFilterCriteria = {
  operator: "and",
  conditions: [],
}

const parseContactFilterQueryParam = (
  value: string | null,
): ContactFilterCriteria | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = contactFilterCriteriaSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const cleanContactFilterUrl = (
  pathname: string,
  searchParams: URLSearchParams,
) => {
  const params = new URLSearchParams(searchParams)
  params.delete("contactFilter")
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

/**
 * Local contact-filter state, seeded once from a `?contactFilter=` deep link
 * (read during the first render so the first list request is already
 * filtered). The param is then stripped from the URL; afterwards the filter
 * lives only in component state.
 */
export function useContactFilterQueryState() {
  const consumedQueryFilterRef = useRef<string | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [filter, setFilter] = useState<ContactFilterCriteria>(
    () =>
      parseContactFilterQueryParam(searchParams.get("contactFilter")) ??
      EMPTY_CONTACT_FILTER,
  )

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey)
    const queryFilterValue = params.get("contactFilter")
    if (
      !queryFilterValue ||
      consumedQueryFilterRef.current === queryFilterValue
    ) {
      return
    }

    const queryFilter = parseContactFilterQueryParam(queryFilterValue)
    if (!queryFilter) {
      return
    }

    consumedQueryFilterRef.current = queryFilterValue
    setFilter(queryFilter)
    window.history.replaceState(
      window.history.state,
      "",
      `${cleanContactFilterUrl(pathname, params)}${window.location.hash}`,
    )
  }, [pathname, searchParamsKey])

  return {
    filter,
    setFilter,
    isActive: filter.conditions.length > 0,
  }
}
