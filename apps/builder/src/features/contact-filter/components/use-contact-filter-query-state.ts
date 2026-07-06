"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  type ContactFilterCriteria,
  contactFilterCriteriaSchema,
} from "../schemas"

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

export function useContactFilterQueryState({
  initialFilter = EMPTY_CONTACT_FILTER,
}: {
  initialFilter?: ContactFilterCriteria
} = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [filter, setFilterState] =
    useState<ContactFilterCriteria>(initialFilter)

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey)
    const queryFilter = parseContactFilterQueryParam(
      params.get("contactFilter"),
    )
    if (!queryFilter) {
      return
    }

    setFilterState(queryFilter)
    router.replace(cleanContactFilterUrl(pathname, params), { scroll: false })
  }, [pathname, router, searchParamsKey])

  const setFilter = useCallback((next: ContactFilterCriteria) => {
    setFilterState(next)
    return Promise.resolve()
  }, [])

  return {
    filter,
    setFilter,
    isActive: filter.conditions.length > 0,
  }
}
