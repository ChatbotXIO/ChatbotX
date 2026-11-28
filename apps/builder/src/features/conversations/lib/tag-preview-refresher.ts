import type { ListContactTagPreviewsResponse } from "../schema/resource"
import { TAG_PREVIEW_REFRESH_BATCH_SIZE } from "./tag-preview"

/** Wait after the first `contactTagsChanged` of a burst, so one request covers it. */
export const TAG_PREVIEW_COALESCE_MS = 500

/** Wait before a failed batch is asked for again. */
export const TAG_PREVIEW_RETRY_DELAY_MS = 5000

/** A batch that keeps failing is given up after this many tries. */
export const TAG_PREVIEW_MAX_ATTEMPTS = 3

/** The refreshed tag summary of one contact. */
export type RefreshedTagPreview = ListContactTagPreviewsResponse["data"][number]

export type TagPreviewRefresherOptions = {
  /** Applies one refreshed contact to the loaded rows. */
  apply: (preview: RefreshedTagPreview) => void
  /** Asks the server for at most `TAG_PREVIEW_REFRESH_BATCH_SIZE` contacts. */
  fetchBatch: (contactIds: string[]) => Promise<RefreshedTagPreview[]>
  /** Whether a row of this contact is loaded; other ids are never fetched. */
  isLoaded: (contactId: string) => boolean
  /** Called when a batch is given up after `TAG_PREVIEW_MAX_ATTEMPTS` tries. */
  onGiveUp?: (contactIds: string[], error: unknown) => void
}

export type TagPreviewRefresher = {
  dispose: () => void
  /** Records contacts whose tags changed; only loaded ones are kept. */
  notify: (contactIds: readonly string[]) => void
}

/**
 * Keeps the tag chips of loaded conversation rows fresh after a
 * `contactTagsChanged` event without a request per event:
 *
 * - ids are intersected with the loaded rows and held in one pending set;
 * - a burst is coalesced for `TAG_PREVIEW_COALESCE_MS`;
 * - at most one request is in flight; ids that arrive meanwhile (even for a
 *   contact that is in that request, whose answer may predate the change)
 *   stay pending and are drained in batches of
 *   `TAG_PREVIEW_REFRESH_BATCH_SIZE` as soon as the request settles;
 * - a failed batch is requeued for a later drain, up to
 *   `TAG_PREVIEW_MAX_ATTEMPTS`, and never blocks the ids behind it.
 */
export const createTagPreviewRefresher = (
  options: TagPreviewRefresherOptions,
): TagPreviewRefresher => {
  const pending = new Set<string>()
  const attempts = new Map<string, number>()
  let isDisposed = false
  let isInFlight = false
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null
  const retryTimers = new Set<ReturnType<typeof setTimeout>>()

  const takeBatch = (): string[] => {
    const batch: string[] = []
    for (const contactId of pending) {
      if (batch.length === TAG_PREVIEW_REFRESH_BATCH_SIZE) {
        break
      }
      pending.delete(contactId)
      if (options.isLoaded(contactId)) {
        batch.push(contactId)
      } else {
        attempts.delete(contactId)
      }
    }
    return batch
  }

  const requeueLater = (batch: string[], error: unknown): void => {
    const retryable: string[] = []
    const exhausted: string[] = []
    for (const contactId of batch) {
      const tries = (attempts.get(contactId) ?? 0) + 1
      attempts.set(contactId, tries)
      if (tries >= TAG_PREVIEW_MAX_ATTEMPTS) {
        attempts.delete(contactId)
        exhausted.push(contactId)
      } else {
        retryable.push(contactId)
      }
    }
    if (exhausted.length > 0) {
      options.onGiveUp?.(exhausted, error)
    }
    if (retryable.length === 0) {
      return
    }
    const timer = setTimeout(() => {
      retryTimers.delete(timer)
      if (isDisposed) {
        return
      }
      for (const contactId of retryable) {
        pending.add(contactId)
      }
      drain().catch(() => undefined)
    }, TAG_PREVIEW_RETRY_DELAY_MS)
    retryTimers.add(timer)
  }

  const drain = async (): Promise<void> => {
    while (!(isDisposed || isInFlight) && pending.size > 0) {
      const batch = takeBatch()
      if (batch.length === 0) {
        continue
      }
      isInFlight = true
      try {
        const previews = await options.fetchBatch(batch)
        if (isDisposed) {
          return
        }
        for (const contactId of batch) {
          attempts.delete(contactId)
        }
        for (const preview of previews) {
          options.apply(preview)
        }
      } catch (error) {
        if (!isDisposed) {
          requeueLater(batch, error)
        }
      } finally {
        isInFlight = false
      }
    }
  }

  return {
    notify: (contactIds) => {
      if (isDisposed) {
        return
      }
      for (const contactId of contactIds) {
        if (options.isLoaded(contactId)) {
          pending.add(contactId)
        }
      }
      if (pending.size === 0 || coalesceTimer !== null || isInFlight) {
        return
      }
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null
        drain().catch(() => undefined)
      }, TAG_PREVIEW_COALESCE_MS)
    },
    dispose: () => {
      isDisposed = true
      pending.clear()
      attempts.clear()
      if (coalesceTimer !== null) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }
      for (const timer of retryTimers) {
        clearTimeout(timer)
      }
      retryTimers.clear()
    },
  }
}
