const MAX_PROVIDER_DESTINATIONS = 5

type SlotDestination = { id: string; provider: string }

/**
 * The destinations whose free posting times the calendar marks: the one picked
 * in the toolbar; else the ones of the picked network (a few); else the only
 * destination there is. Nothing otherwise: markers for every queue at once
 * would drown the posts.
 */
export const slotDestinationIds = (
  options: readonly SlotDestination[],
  filter: { destinationId: string | null; provider: string | null },
): string[] => {
  if (filter.destinationId) {
    return [filter.destinationId]
  }
  if (filter.provider) {
    return options
      .filter((option) => option.provider === filter.provider)
      .slice(0, MAX_PROVIDER_DESTINATIONS)
      .map((option) => option.id)
  }
  return options.length === 1 && options[0] ? [options[0].id] : []
}

/** Several destinations' free times as one ascending list without repeats. */
export const mergeSlots = (lists: readonly (readonly Date[])[]): Date[] => {
  const byTime = new Map<number, Date>()
  for (const slot of lists.flat()) {
    byTime.set(slot.getTime(), slot)
  }
  return [...byTime.values()].sort((a, b) => a.getTime() - b.getTime())
}

/** Most requests one destination's free times may take for a calendar period. */
export const MAX_FREE_SLOT_REQUESTS = 4

type FreeSlotPage = { items: Date[]; timezone: string | undefined }

export type PagedFreeSlots = FreeSlotPage & {
  /** True when the request budget ran out before the period was covered. */
  isTruncated: boolean
}

/**
 * Reads a destination's free times page by page (`after` = the last time seen)
 * until one reaches `until`, a page comes back short (no more times) or
 * `maxRequests` is spent. The caller shows a note when the period is cut.
 */
export const collectFreeSlotPages = async ({
  fetchPage,
  from,
  limit,
  maxRequests = MAX_FREE_SLOT_REQUESTS,
  until,
}: {
  fetchPage: (after: Date) => Promise<FreeSlotPage>
  from: Date
  limit: number
  maxRequests?: number
  until: Date
}): Promise<PagedFreeSlots> => {
  const items: Date[] = []
  let after = from
  let timezone: string | undefined
  for (let request = 1; request <= maxRequests; request++) {
    const page = await fetchPage(after)
    timezone = page.timezone ?? timezone
    items.push(...page.items)
    const last = page.items.at(-1)
    if (!last || page.items.length < limit || last >= until) {
      return { isTruncated: false, items, timezone }
    }
    after = last
  }
  return { isTruncated: true, items, timezone }
}
