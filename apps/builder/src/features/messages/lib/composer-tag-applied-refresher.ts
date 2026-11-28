/** Wait after the first `contactTagsChanged` of a burst, so one request covers it. */
export const COMPOSER_TAG_APPLIED_COALESCE_MS = 500

export type ComposerTagAppliedRefresherOptions = {
  /** Asks the server which of the tags the contact has (at most `maxTagIdsPerRequest`). */
  fetchApplied: (contactId: string, tagIds: string[]) => Promise<string[]>
  /** Most tag ids one `fetchApplied` call may carry; a longer list is asked in slices. */
  maxTagIdsPerRequest: number
  /** Ids of every tag the grid has loaded for the contact (all pages). */
  loadedTagIds: (contactId: string) => string[]
  /** Where the agent's settlements are now; taken before each check starts. */
  settleSequence: () => number
  /**
   * Writes the answer into the cache. `tagIds` is what was asked about and
   * `requestSequence` the value of `settleSequence` when the check began.
   * Returns the tags it did not write because the answer cannot be trusted
   * for them (an unsettled click, or one settled since the check began).
   */
  apply: (
    contactId: string,
    tagIds: string[],
    appliedTagIds: string[],
    requestSequence: number,
  ) => string[]
  /** Resolves once the tag has no unsettled request of this agent. */
  whenTagIdle: (contactId: string, tagId: string) => Promise<void>
  /** The request failed: fall back to re-reading the grid. */
  onFailure: (contactId: string, error: unknown) => void
}

export type ComposerTagAppliedRefresher = {
  dispose: () => void
  /** Records that the contact's tags changed. */
  notify: (contactId: string) => void
}

/**
 * Keeps the open contact's composer grid fresh after a `contactTagsChanged`
 * event with one small request however many pages are loaded: events are
 * coalesced, at most one check is in flight (a very long id list is asked in
 * slices), and a change that arrives meanwhile runs one more check once it
 * settles (its answer may predate it). A tag the answer could not be applied
 * to is checked once more after its own click has settled.
 */
export const createComposerTagAppliedRefresher = (
  options: ComposerTagAppliedRefresherOptions,
): ComposerTagAppliedRefresher => {
  const pending = new Set<string>()
  let isDisposed = false
  let isInFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const fetchAllApplied = async (
    contactId: string,
    tagIds: string[],
  ): Promise<string[]> => {
    const applied: string[] = []
    for (
      let offset = 0;
      offset < tagIds.length;
      offset += options.maxTagIdsPerRequest
    ) {
      const slice = tagIds.slice(offset, offset + options.maxTagIdsPerRequest)
      applied.push(...(await options.fetchApplied(contactId, slice)))
    }
    return applied
  }

  const recheckWhenIdle = (contactId: string, tagIds: string[]): void => {
    // Each tag asks for its own recheck: one stuck behind a slow request
    // must not hold back the others, and `notify` coalesces the asks.
    for (const tagId of tagIds) {
      options
        .whenTagIdle(contactId, tagId)
        .then(() => notify(contactId))
        .catch(() => undefined)
    }
  }

  const notify = (contactId: string): void => {
    if (isDisposed) {
      return
    }
    pending.add(contactId)
    if (timer !== null || isInFlight) {
      return
    }
    timer = setTimeout(() => {
      timer = null
      drain().catch(() => undefined)
    }, COMPOSER_TAG_APPLIED_COALESCE_MS)
  }

  const drain = async (): Promise<void> => {
    while (!(isDisposed || isInFlight) && pending.size > 0) {
      const [contactId] = pending
      pending.delete(contactId)
      const tagIds = options.loadedTagIds(contactId)
      if (tagIds.length === 0) {
        continue
      }
      isInFlight = true
      try {
        const requestSequence = options.settleSequence()
        const applied = await fetchAllApplied(contactId, tagIds)
        if (!isDisposed) {
          recheckWhenIdle(
            contactId,
            options.apply(contactId, tagIds, applied, requestSequence),
          )
        }
      } catch (error) {
        if (!isDisposed) {
          options.onFailure(contactId, error)
        }
      } finally {
        isInFlight = false
      }
    }
  }

  return {
    notify,
    dispose: () => {
      isDisposed = true
      pending.clear()
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
