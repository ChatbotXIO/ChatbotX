"use client"

import { parseAsJson, useQueryState } from "nuqs"
import {
  type ContactFilterCriteria,
  contactFilterCriteriaSchema,
} from "../schemas"

const EMPTY_CONTACT_FILTER: ContactFilterCriteria = {
  operator: "and",
  conditions: [],
}

const parseContactFilter = (value: unknown): ContactFilterCriteria | null => {
  const parsed = contactFilterCriteriaSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function useContactFilterQueryState() {
  const [filter, setFilter] = useQueryState(
    "contactFilter",
    parseAsJson(parseContactFilter)
      .withDefault(EMPTY_CONTACT_FILTER)
      .withOptions({ shallow: false, clearOnDefault: true }),
  )

  return {
    filter,
    setFilter,
    isActive: filter.conditions.length > 0,
  }
}
